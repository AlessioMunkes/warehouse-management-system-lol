// ─────────────────────────────────────────────────────────────
// client/src/features/feedTheSoil/DropPointsTab.jsx
//
// The Drop-off sites tab on Feed the Soil (migration 069). People bring
// their compost to pop-up stands and other sites, not only to the
// warehouse. Each site here has a QR poster to print and hang there;
// scanning it opens a public form for the weight and an optional email
// for a thank-you. Below the sites, the latest drop-offs: they count in
// compost processed, and one that is not real (a test, a typo) can be
// rejected, or counted again.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { MapPin, Plus, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ListCard from '@/components/ui/list-card';
import EmptyState from '@/components/ui/empty-state';
import ErrorBanner from '@/components/ui/error-banner';
import StatusBadge from '@/components/ui/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getDropPoints, createDropPoint, updateDropPoint, getDropoffs, setDropoffStatus } from '@/services/ftsDropPointAPI';
import { openDropPointPoster } from './dropPointPoster';
import { isReachableByPhone, publicAppOrigin } from '../packing/palletLabelPdf';
import { fmtKg } from './feedTheSoilLists';

const when = (iso) => (iso
  ? new Date(iso).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg' })
  : '-');

export default function DropPointsTab() {
  const [sites, setSites] = useState(null);
  const [dropoffs, setDropoffs] = useState([]);
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: '', suburb: '' });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const [s, d] = await Promise.all([getDropPoints(), getDropoffs()]);
      setSites(s);
      setDropoffs(d);
      setError(null);
    } catch (err) {
      setError(err.message || 'Could not load the drop-off sites.');
    }
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([getDropPoints(), getDropoffs()])
      .then(([s, d]) => { if (!cancelled) { setSites(s); setDropoffs(d); } })
      .catch((err) => { if (!cancelled) setError(err.message || 'Could not load the drop-off sites.'); });
    return () => { cancelled = true; };
  }, []);

  const add = async () => {
    setBusy(true);
    try {
      await createDropPoint(draft);
      setDraft({ name: '', suburb: '' });
      setAdding(false);
      await load();
    } catch (err) {
      setError(err.message || 'Could not add the site.');
    } finally {
      setBusy(false);
    }
  };

  const act = async (fn) => {
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err.message || 'That did not go through.');
    }
  };

  const print = (site) => {
    if (!openDropPointPoster(site)) setError('The browser blocked the poster. Allow pop-ups for this site and try again.');
  };

  // A poster printed from a dev server or the office network points at
  // an address a visitor's phone cannot reach; say so before it is hung.
  const unreachable = !isReachableByPhone(publicAppOrigin());

  return (
    <div className="space-y-6">
      <ErrorBanner message={error} />
      {unreachable ? (
        <p role="status" className="rounded-lg border border-warn p-3 text-sm text-warn">
          Posters printed here point at {publicAppOrigin() || 'this computer'}, which a phone at the stand cannot reach. Print them from the live system.
        </p>
      ) : null}

      <ListCard
        header={(
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">Pop-up stands and other places people return their compost. Hang each one’s QR poster there.</p>
            <Button type="button" size="sm" onClick={() => setAdding(true)}><Plus /> Add a site</Button>
          </div>
        )}
      >
        {adding ? (
          <div className="flex flex-wrap items-end gap-2 border-b p-4">
            <label className="text-sm">
              <span className="block text-xs text-muted-foreground">Site name</span>
              <Input value={draft.name} maxLength={120} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} aria-label="Site name" className="w-56" />
            </label>
            <label className="text-sm">
              <span className="block text-xs text-muted-foreground">Suburb</span>
              <Input value={draft.suburb} maxLength={120} onChange={(e) => setDraft((d) => ({ ...d, suburb: e.target.value }))} aria-label="Suburb" className="w-44" />
            </label>
            <Button type="button" size="sm" disabled={busy || !draft.name.trim()} onClick={add}>Add site</Button>
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        ) : null}
        {!sites && !error ? (
          <div className="space-y-2 p-4" aria-busy="true">{[0, 1].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : sites && sites.length === 0 ? (
          <EmptyState icon={MapPin} title="No drop-off sites yet" description="Add a pop-up stand or another site, then print its QR poster to hang there." />
        ) : sites ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4 sm:pl-5">Site</TableHead>
                <TableHead className="text-right">Drop-offs</TableHead>
                <TableHead className="text-right">Compost</TableHead>
                <TableHead>Last drop-off</TableHead>
                <TableHead className="pr-4 sm:pr-5"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sites.map((s) => (
                <TableRow key={s.id} className={s.isActive ? undefined : 'text-muted-foreground'}>
                  <TableCell className="pl-4 sm:pl-5">
                    <span className="font-medium">{s.name}</span>{s.isActive ? '' : ' (closed)'}
                    {s.suburb ? <span className="block text-xs text-muted-foreground">{s.suburb}</span> : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{s.dropoffCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtKg(s.kgTotal)}</TableCell>
                  <TableCell className="text-muted-foreground">{when(s.lastDropoffAt)}</TableCell>
                  <TableCell className="whitespace-nowrap pr-4 text-right sm:pr-5">
                    <div className="flex justify-end gap-2">
                      {s.isActive ? (
                        <Button type="button" size="sm" variant="outline" aria-label={`Print QR poster for ${s.name}`} onClick={() => print(s)}>
                          <Printer /> QR poster
                        </Button>
                      ) : null}
                      <Button type="button" size="sm" variant="outline" onClick={() => act(() => updateDropPoint(s.id, { isActive: !s.isActive }))}>
                        {s.isActive ? 'Close site' : 'Reopen'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </ListCard>

      <section aria-labelledby="dropoffs-heading">
        <h2 id="dropoffs-heading" className="mb-2 text-sm font-medium">Latest drop-offs</h2>
        <ListCard>
          {dropoffs.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nothing logged at a site yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4 sm:pl-5">When</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead className="text-right">Compost</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead className="pr-4 sm:pr-5"><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dropoffs.map((d) => (
                  <TableRow key={d.id} className={d.status === 'rejected' ? 'text-muted-foreground line-through' : undefined}>
                    <TableCell className="pl-4 sm:pl-5">{when(d.submittedAt)}</TableCell>
                    <TableCell>{d.site}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtKg(d.kg)}</TableCell>
                    <TableCell>
                      {d.donorName || 'Not given'}
                      {d.askedForThanks ? <span className="block text-xs text-muted-foreground">Thank-you {d.thanksStatus === 'failed' ? 'not sent' : 'emailed'}</span> : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap pr-4 text-right sm:pr-5">
                      {d.status === 'rejected' ? (
                        <span className="inline-flex items-center gap-2">
                          <StatusBadge kind="record" status="inactive">Rejected</StatusBadge>
                          <Button type="button" size="sm" variant="ghost" onClick={() => act(() => setDropoffStatus(d.id, 'logged'))}>Count it</Button>
                        </span>
                      ) : (
                        <Button type="button" size="sm" variant="outline" onClick={() => act(() => setDropoffStatus(d.id, 'rejected'))}>Reject</Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </ListCard>
      </section>
    </div>
  );
}
