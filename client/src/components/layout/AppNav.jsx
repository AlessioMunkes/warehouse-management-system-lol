// ─────────────────────────────────────────────────────────────
// client/src/components/layout/AppNav.jsx
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
import { ChevronDown, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet, SheetContent, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAuth } from '../../context/AuthContext';
import { NAV_SECTIONS, homeForRole } from './navSections';
import useAttention from '../../features/dashboard/useAttention';
import batchesLogo from '../../assets/Batches_Logo.jpeg';

// Each section of the menu has its own colour, from the chart palette,
// so a section reads as a place: inbound teal, outbound terracotta,
// stock green. The icon sits on a faint tile of it. Anything not listed
// is ink.
const SECTION_TONE = {
  Inbound: 'var(--viz-1)', Donations: 'var(--viz-5)', Stock: 'var(--viz-3)',
  Outbound: 'var(--viz-2)', Programmes: 'var(--viz-4)', Insights: 'var(--viz-7)',
  'Master data': 'var(--viz-6)', Logs: 'var(--viz-7)', Warehouse: 'var(--viz-2)',
};
const toneOf = (section) => SECTION_TONE[section] ?? 'var(--ink)';

// `count` — how many things on this screen need dealing with, or
// nothing. Expanded it is a number at the end of the row; collapsed, a
// dot on the icon. Either way the accessible name says it in words, so
// it never rests on the pill alone.
//
// The open item is marked by a red bar at its left edge, a bolder name
// and its icon filled in, not by a filled block: the solid pill is what
// every dashboard template does.
const NavLink = ({ to, label, icon: Icon, active, collapsed, onNavigate, count, tone }) => {
  const flagged = count > 0;
  const name = flagged ? `${label}, ${count} need${count === 1 ? 's' : ''} attention` : label;
  const link = (
    <Link
      to={to}
      onClick={onNavigate}
      // Collapsed, the text that named this link is gone, so the name
      // has to come from somewhere. Expanded, an aria-label is only
      // needed when there is a count to say.
      aria-label={collapsed || flagged ? name : undefined}
      aria-current={active ? 'page' : undefined}
      className={`relative flex items-center rounded-lg text-sm transition-colors ${
        collapsed ? 'justify-center px-0 py-1.5' : 'gap-2.5 py-1.5 pl-3 pr-2'
      } ${
        active
          ? 'bg-surface-2 font-semibold text-ink'
          : 'text-ink/85 hover:bg-surface-2/70 hover:text-ink'
      }`}
    >
      {active ? (
        <span aria-hidden="true" className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-brand" />
      ) : null}
      <span
        className="relative grid size-7 shrink-0 place-items-center rounded-md"
        style={{ background: `color-mix(in srgb, ${tone} ${active ? 22 : 13}%, transparent)`, color: tone }}
      >
        <Icon className="size-[18px]" weight={active ? 'fill' : 'duotone'} aria-hidden="true" />
        {collapsed && flagged ? (
          <span aria-hidden="true" className="absolute -right-1 -top-1 size-2 rounded-full bg-danger" />
        ) : null}
      </span>
      {collapsed ? null : <span className="min-w-0 flex-1">{label}</span>}
      {!collapsed && flagged ? (
        <span
          aria-hidden="true"
          className="ml-auto rounded-full bg-danger-soft px-1.5 text-[11px] font-medium tabular-nums text-danger"
        >
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </Link>
  );

  if (!collapsed) return link;

  // Not decoration: on the rail this is the only way a sighted user
  // reads what an icon is. side="right" because the rail is flush to
  // the left edge and a tooltip above it would sit over the icon above.
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{name}</TooltipContent>
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
// Which sections a person has folded, per role, on this device. A view
// preference, not data: losing it costs a click, so storage failing
// (a private window) is ignored.
const foldKey = (role) => `wms.sidebar.folded:${role ?? 'none'}`;
const readFolded = (role) => {
  try { return JSON.parse(localStorage.getItem(foldKey(role)) ?? '[]'); } catch { return []; }
};
const writeFolded = (role, list) => {
  try { localStorage.setItem(foldKey(role), JSON.stringify(list)); } catch { /* no storage */ }
};

export const SidebarNav = ({ sections, pathname, homeTo, collapsed = false, onNavigate }) => {
  // Counts only for the manager's menu — the only one whose items say
  // how to read them (navSections.js `count`).
  const { user } = useAuth();
  const attention = useAttention(user?.role === 'manager');
  // The item the page sits under: its own path, or the longest one the
  // path starts with, so an event's workspace (/volunteers/events/…)
  // still marks Volunteer Events, and /admin/users does not also mark
  // the /admin dashboard.
  const activeTo = sections
    .flatMap((section) => section.items.map((item) => item.to))
    .filter((to) => pathname === to || pathname?.startsWith(`${to}/`))
    .sort((x, y) => y.length - x.length)[0];

  // Sections fold by their heading (Overview, Inbound, ...). The one
  // holding the page you are on opens again when you arrive at it, so
  // the open item is never hidden inside a folded section.
  const activeSection = sections.find((sec) => sec.items.some((item) => item.to === activeTo))?.label ?? null;
  const [folded, setFolded] = useState(() => readFolded(user?.role).filter((l) => l !== activeSection));
  const [openedFor, setOpenedFor] = useState(activeSection);
  if (activeSection !== openedFor) {
    setOpenedFor(activeSection);
    if (activeSection && folded.includes(activeSection)) {
      const next = folded.filter((l) => l !== activeSection);
      setFolded(next);
      writeFolded(user?.role, next);
    }
  }
  const toggleSection = (label) => {
    const next = folded.includes(label) ? folded.filter((l) => l !== label) : [...folded, label];
    setFolded(next);
    writeFolded(user?.role, next);
  };

  const body = (
    <>
      <Link
        to={homeTo}
        onClick={onNavigate}
        aria-label={collapsed ? 'Batches, home' : undefined}
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

      <nav className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        {sections.map((section, index) => {
          // The icon rail has no headings to fold by, so it shows everything.
          const isFolded = !collapsed && folded.includes(section.label);
          const listId = `nav-section-${index}`;
          const waiting = attention
            ? section.items.reduce((sum, item) => sum + (item.count ? item.count(attention) : 0), 0)
            : 0;
          return (
          <div key={section.label}>
            {collapsed ? (
              // The heading is what grouped these. With no room to say
              // it, a rule keeps the grouping visible — except above the
              // first group, where it would just underline the logo.
              index === 0
                ? null
                : <div aria-hidden="true" className="mx-2 mb-3 border-t border-line" />
            ) : (
              // A plain word after a short red rule. Not grey capitals
              // with wide letter spacing, which is the stock dashboard
              // label. The heading folds and unfolds its section; folded,
              // it still shows how much inside needs dealing with.
              <button
                type="button"
                onClick={() => toggleSection(section.label)}
                aria-expanded={!isFolded}
                aria-controls={listId}
                className="mb-1.5 flex w-full items-center gap-2 rounded-md px-3 py-0.5 text-left text-xs font-semibold text-ink hover:bg-surface-2/70"
              >
                <span aria-hidden="true" className="h-0.5 w-3 rounded-full bg-brand" />
                <span className="flex-1">{section.label}</span>
                {isFolded && waiting > 0 ? (
                  <span className="rounded-full bg-danger-soft px-1.5 text-[11px] font-medium tabular-nums text-danger">
                    {waiting > 99 ? '99+' : waiting}
                    <span className="sr-only"> need attention</span>
                  </span>
                ) : null}
                <ChevronDown aria-hidden="true" className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${isFolded ? '-rotate-90' : ''}`} />
              </button>
            )}
            <div id={listId} hidden={isFolded} className="flex flex-col gap-0.5">
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  {...item}
                  count={attention && item.count ? item.count(attention) : 0}
                  active={item.to === activeTo}
                  tone={toneOf(section.label)}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </div>
          );
        })}
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
