// ─────────────────────────────────────────────────────────────
// client/src/features/taskdashboard/components/WarehouseSwitcher.jsx
//
// Which warehouse you are working in, always on screen, and the way
// to change it.
//
// Renders nothing with one database (the server names no warehouse).
// Someone with one warehouse sees its name and nothing to click.
// Someone with several gets a list; picking one re-reads who they are
// at that site (their role there may differ), clears everything the
// app had cached for the old site, and goes to the new site's home
// screen, so nobody is left looking at another warehouse's page.
//
// The name stays visible on purpose: the costly mistake with several
// warehouses is recording a delivery against the wrong one.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronDown, Warehouse } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '@/components/ui/toastContext';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { homeForRole } from './navSections';

const WarehouseSwitcher = () => {
  const { user, switchWarehouse } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const sites = user?.warehouses ?? [];
  if (!user?.warehouse || sites.length === 0) return null;

  const current = sites.find((w) => w.code === user.warehouse);
  const currentName = current?.name || user.warehouse;

  const label = (
    <>
      <Warehouse aria-hidden="true" />
      <span className="max-w-[10rem] truncate">{currentName}</span>
    </>
  );

  if (sites.length === 1) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm [&_svg]:size-4"
        title={`Working in ${currentName}`}
        data-testid="warehouse-badge"
      >
        {label}
      </span>
    );
  }

  const choose = async (code) => {
    setOpen(false);
    if (code === user.warehouse || busy) return;
    const name = sites.find((w) => w.code === code)?.name || code;
    setBusy(true);
    try {
      const next = await switchWarehouse(code);
      navigate(homeForRole(next?.role), { replace: true });
      toast({ variant: 'success', title: `Now working in ${name}` });
    } catch (err) {
      toast({
        variant: 'error',
        title: `Could not switch to ${name}`,
        description: err?.message || 'Please try again.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          aria-label={`Warehouse: ${currentName}. Change warehouse`}
          title={`Working in ${currentName}`}
        >
          {label}
          <ChevronDown aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-1">
        <p className="px-2.5 py-1.5 text-xs text-muted-foreground">Switch warehouse</p>
        <ul role="listbox" aria-label="Warehouses">
          {sites.map((site) => {
            const selected = site.code === user.warehouse;
            return (
              <li key={site.code} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => choose(site.code)}
                  className="flex w-full items-center justify-between rounded-[4px] px-2.5 py-1.5 text-left text-sm hover:bg-muted/50"
                >
                  <span>{site.name || site.code}</span>
                  {selected ? <Check className="size-4" aria-hidden="true" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
};

export default WarehouseSwitcher;
