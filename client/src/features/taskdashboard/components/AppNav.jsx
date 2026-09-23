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
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAuth } from '../../../context/AuthContext';
import { NAV_SECTIONS, homeForRole } from './navSections';
import batchesLogo from '../../../assets/Batches_Logo.jpeg';

const NavLink = ({ to, label, icon: Icon, active, collapsed, onNavigate }) => {
  const link = (
    <Link
      to={to}
      onClick={onNavigate}
      // Collapsed, the text that named this link is gone, so the name
      // has to come from somewhere. Expanded, an aria-label would just
      // duplicate the visible text.
      aria-label={collapsed ? label : undefined}
      className={`flex items-center rounded-[4px] text-sm transition-colors ${
        collapsed ? 'justify-center px-0 py-2.5' : 'gap-2.5 px-3 py-2'
      } ${
        active
          ? 'bg-ink text-on-ink font-medium'
          : 'text-ink hover:bg-surface-2'
      }`}
    >
      <Icon className="size-4 shrink-0" />
      {collapsed ? null : label}
    </Link>
  );

  if (!collapsed) return link;

  // Not decoration: on the rail this is the only way a sighted user
  // reads what an icon is. side="right" because the rail is flush to
  // the left edge and a tooltip above it would sit over the icon above.
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
};

// The brand block and the section list. `onNavigate` closes the drawer
// on tap; the desktop sidebar passes nothing, having nothing to close.
// `collapsed` defaults to false, which is what keeps this one
// definition serving three call sites: the desktop rail passes it, and
// both drawers (ManagerLayout's hamburger, StaffShell's) leave it alone
// and render exactly what they rendered before. A drawer is already a
// full-width panel someone deliberately opened — an icon rail inside
// one would be a smaller target for no gain.
export const SidebarNav = ({ sections, pathname, homeTo, collapsed = false, onNavigate }) => {
  const body = (
    <>
      <Link
        to={homeTo}
        onClick={onNavigate}
        aria-label={collapsed ? 'Batches — home' : undefined}
        className={`mb-6 flex items-center ${collapsed ? 'justify-center px-0' : 'gap-2 px-2'}`}
      >
        <img src={batchesLogo} alt="" className="h-8 w-8 shrink-0 rounded-[4px] object-cover" />
        {collapsed ? null : (
          <div>
            <p className="text-sm font-semibold leading-tight">Batches</p>
            <p className="text-[11px] leading-tight text-muted-foreground">Nourish Our Children</p>
          </div>
        )}
      </Link>

      <nav className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
        {sections.map((section, index) => (
          <div key={section.label}>
            {collapsed ? (
              // The heading is what grouped these. With no room to say
              // it, a rule keeps the grouping visible — except above the
              // first group, where it would just underline the logo.
              index === 0
                ? null
                : <div aria-hidden="true" className="mx-2 mb-3 border-t border-line" />
            ) : (
              <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {section.label}
              </p>
            )}
            <div className="flex flex-col gap-0.5">
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  {...item}
                  active={pathname === item.to}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>
    </>
  );

  // One provider around the rail rather than one per link, and only
  // when collapsed: expanded, every link says its own name and a
  // tooltip repeating it is noise for a screen reader and a mouse both.
  return collapsed ? <TooltipProvider>{body}</TooltipProvider> : body;
};

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
