// ─────────────────────────────────────────────────────────────
// WarehouseLayoutPage.jsx
//
// The admin's floor plan of this warehouse (features/warehouseMap/
// LayoutBuilder.jsx). Managers see it on Inventory's Map tab and count
// stock into its areas; they cannot change it, and the floor never sees
// it. Each warehouse database has a plan of its own.
//
// Nothing is saved while drawing. Save layout sends the whole plan at
// once; an area taken off it keeps its history, and the stock counted
// there shows as not placed.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Map as MapIcon } from 'lucide-react';
import PageHeader, { PageShell } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/ui/empty-state';
import ErrorBanner from '@/components/ui/error-banner';
import { useToast } from '@/components/ui/toastContext';
import LayoutBuilder from '../features/warehouseMap/LayoutBuilder';
import { overlapping } from '../features/warehouseMap/mapGeometry';
import { getWarehouseMap, saveWarehouseLayout } from '../services/warehouseMapAPI';

const toPlan = (areas) => areas.map(({
  id, name, kind, x, y, w, h, levels, capacityKg = null, palletSpaces = null, preferredProductIds = [], preferredCategories = [],
}) => ({ id, name, kind, x, y, w, h, levels, capacityKg, palletSpaces, preferredProductIds, preferredCategories }));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// What stops the plan saving, in words; null when it can be saved.
const problemWith = (plan) => {
  if (overlapping(plan).size > 0) return 'Areas overlap.';
  if (plan.some((a) => !a.name.trim())) return 'Every area needs a name.';
  const names = plan.map((a) => a.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) return 'Two areas have the same name.';
  return null;
};

export default function WarehouseLayoutPage() {
  const toast = useToast();
  const [map, setMap] = useState(null);
  const [plan, setPlan] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);

  const take = (next) => { setMap(next); setPlan(toPlan(next.areas)); };

  const load = useCallback(async () => {
    try {
      take(await getWarehouseMap());
      setLoadError(null);
    } catch (err) {
      setLoadError(err.message || 'Could not load the plan.');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    getWarehouseMap()
      .then((next) => { if (!cancelled) { setMap(next); setPlan(toPlan(next.areas)); setLoadError(null); } })
      .catch((err) => { if (!cancelled) setLoadError(err.message || 'Could not load the plan.'); });
    return () => { cancelled = true; };
  }, []);

  const saved = useMemo(() => toPlan(map?.areas ?? []), [map]);
  const dirty = !same(saved, plan);
  const problem = problemWith(plan);

  // Leaving with unsaved drawing asks first.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const counted = useMemo(
    () => new Map((map?.areas ?? []).map((a) => [a.id, a.items.filter((i) => i.about > 0).length])),
    [map],
  );

  const save = async () => {
    setSaving(true);
    try {
      take(await saveWarehouseLayout(plan.map((a) => ({ ...a, id: a.id > 0 ? a.id : null, name: a.name.trim() }))));
      toast({ variant: 'success', title: 'Saved the layout', description: 'Managers see it on the Inventory map.' });
    } catch (err) {
      toast({ variant: 'error', title: 'Could not save the layout', description: err.message || 'Nothing was changed.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell>
      <PageHeader
        title="Warehouse layout"
        description="Draw where stock is kept, set how much each area holds and what it is for."
        actions={map?.ready ? (
          <>
            {dirty ? (
              <Button type="button" variant="outline" onClick={() => setPlan(saved)} disabled={saving}>Discard changes</Button>
            ) : null}
            <Button type="button" onClick={save} disabled={!dirty || Boolean(problem) || saving} title={problem ?? undefined}>
              {saving ? 'Saving…' : 'Save layout'}
            </Button>
          </>
        ) : null}
      />

      <div className="mt-6">
        {loadError ? (
          <ErrorBanner message={loadError} onRetry={load} />
        ) : !map ? (
          <Skeleton className="aspect-[5/3] w-full rounded-xl" />
        ) : !map.ready ? (
          <EmptyState
            icon={MapIcon}
            title="This warehouse needs a database update"
            description="Run npm run migrate on the server, then reload this page."
          />
        ) : (
          <LayoutBuilder areas={plan} onChange={setPlan} grid={map.grid} products={map.products} countedOf={(id) => counted.get(id) ?? 0} />
        )}
      </div>
    </PageShell>
  );
}
