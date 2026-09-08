// ─────────────────────────────────────────────────────────────
// client/src/pages/AssignPickingSlipsPage.jsx
//
// Manager view for assigning an unclaimed slip to a specific worker
// — the manager half of picking.service.js's assignSlip, which
// already accepts a packerId from a manager caller and has since the
// feature was built. Workers claim their own slips from
// PackingBoard.jsx/StaffSlipList.jsx; this is for the case a manager
// wants to place work on someone directly rather than wait for a
// self-claim.
//
// Only 'pending' (unassigned) slips are actionable here — anything
// already claimed, in progress, complete or cancelled is read-only
// context, matching picking.service.js's own LOCKED_REASON set for
// what assignSlip will actually accept.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react';
import { TopNavbar } from '../features/taskdashboard/components/TopNavBar';
import {
  fetchPickingSlips, fetchAssignableWorkers, assignSlip,
} from '../services/pickingAPI';

import { Button }   from '@/components/ui/button';
import { Input }    from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Card, CardContent,
} from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

const todayISO = () => new Date().toISOString().slice(0, 10);

const ErrorBanner = ({ message }) => (
  <div className="p-4 rounded-[4px] bg-[#fff4f2] border-2 border-[#ef3a40] text-[#2b3336] text-sm">
    {message}
  </div>
);

export default function AssignPickingSlipsPage() {
  const [reducedMovement, setReducedMovement] = useState(false);

  const [viewDate, setViewDate] = useState(todayISO());
  const [slips, setSlips] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [choice, setChoice] = useState({}); // slipId -> chosen packerId

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [assigningId, setAssigningId] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [slipRows, workerRows] = await Promise.all([
        fetchPickingSlips({ dispatchDate: viewDate }),
        fetchAssignableWorkers(),
      ]);
      setSlips(slipRows);
      setWorkers(workerRows);
    } catch (err) {
      setError(err.message || 'Could not load picking slips.');
    }
  }, [viewDate]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    load().finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [load]);

  const assign = async (slipId) => {
    const packerId = choice[slipId];
    if (!packerId) return;
    setAssigningId(slipId);
    setError(null);
    try {
      await assignSlip(slipId, Number(packerId));
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setAssigningId(null);
    }
  };

  const unassigned = slips.filter((s) => s.status === 'pending');
  const assigned = slips.filter((s) => s.status !== 'pending');

  return (
    <>
      <TopNavbar
        reducedMovement={reducedMovement}
        onToggleMovement={() => setReducedMovement((v) => !v)}
      />

      <main className="mx-auto w-full max-w-5xl px-4 py-6">
        <h1 className="text-2xl font-medium">Assign Picking Slips</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Place unclaimed slips directly on a worker, instead of waiting for a self-claim.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted-foreground">Dispatch date</span>
          <Input
            type="date" value={viewDate} className="w-auto"
            onChange={(e) => setViewDate(e.target.value)}
          />
        </div>

        {error ? <div className="mt-4"><ErrorBanner message={error} /></div> : null}

        {isLoading ? (
          <div className="mt-6 space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <div className="mt-6 space-y-8">
            <div>
              <h2 className="text-lg font-medium">Unassigned</h2>
              {unassigned.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">Nothing waiting to be assigned for this date.</p>
              ) : (
                <Card className="mt-3">
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Beneficiary</TableHead>
                          <TableHead>Cohort</TableHead>
                          <TableHead>Assign to</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {unassigned.map((slip) => (
                          <TableRow key={slip.id}>
                            <TableCell className="font-medium">{slip.ecd_name}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {slip.cohort === 'week1' ? 'Week 1' : 'Week 2'}
                            </TableCell>
                            <TableCell>
                              <Select
                                value={choice[slip.id] || undefined}
                                onValueChange={(v) => setChoice((c) => ({ ...c, [slip.id]: v }))}
                              >
                                <SelectTrigger className="w-48"><SelectValue placeholder="Select a worker" /></SelectTrigger>
                                <SelectContent>
                                  {workers.map((w) => (
                                    <SelectItem key={w.id} value={String(w.id)}>
                                      {w.first_name} {w.last_name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Button
                                type="button" size="sm"
                                disabled={!choice[slip.id] || assigningId === slip.id}
                                onClick={() => assign(slip.id)}
                              >
                                {assigningId === slip.id ? 'Assigning' : 'Assign'}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </div>

            <div>
              <h2 className="text-lg font-medium">Already assigned or in progress</h2>
              {assigned.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">Nothing else for this date.</p>
              ) : (
                <Card className="mt-3">
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Beneficiary</TableHead>
                          <TableHead>Cohort</TableHead>
                          <TableHead>Assigned to</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {assigned.map((slip) => (
                          <TableRow key={slip.id}>
                            <TableCell className="font-medium">{slip.ecd_name}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {slip.cohort === 'week1' ? 'Week 1' : 'Week 2'}
                            </TableCell>
                            <TableCell className="text-muted-foreground">{slip.packer_name || '—'}</TableCell>
                            <TableCell><Badge variant="outline">{slip.status}</Badge></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
      </main>
    </>
  );
}
