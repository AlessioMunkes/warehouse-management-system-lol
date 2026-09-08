// ─────────────────────────────────────────────────────────────
// client/src/pages/DocumentsPage.jsx
//
// A manager-facing archive of every generated delivery note and
// dispatch note — select a row, the same PDF component that already
// pops up right after a delivery/collection opens. Nothing new on
// the backend: receivingAPI.getDeliveries/getDeliveryById and
// dispatchAPI.getHistory/getDispatchNote are the exact functions
// StaffDeliveriesPage.jsx/StaffDispatchHistoryPage.jsx already use
// for the staff-side equivalent of this same list — this is that
// same data, reachable from the manager sidebar instead of the
// phone-first staff flow.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import ManagerLayout from '../features/taskdashboard/components/ManagerLayout';
import DeliveryNotePDF from '../features/procurement/components/DeliveryNotePDF';
import DispatchNotePDF from '../features/dispatch/components/DispatchNotePDF';
import receivingAPI from '../services/receivingAPI';
import dispatchAPI   from '../services/dispatchAPI';

import { Skeleton } from '@/components/ui/skeleton';
import { Badge }    from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Card, CardContent,
} from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

const RANGE_OPTIONS = [
  { value: 'week', label: 'Last 7 days' },
  { value: 'month', label: 'Last 30 days' },
  { value: 'all', label: 'All time' },
];

const fmtDate = (value) =>
  value ? new Date(value).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

const ErrorBanner = ({ message }) => (
  <div className="p-3 rounded-[4px] bg-[#fff4f2] border-2 border-[#ef3a40] text-[#2b3336] text-sm">
    {message}
  </div>
);

export default function DocumentsPage() {
  const [kind, setKind] = useState('delivery'); // delivery | dispatch
  const [range, setRange] = useState('month');
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openingId, setOpeningId] = useState(null);
  const [pdfDelivery, setPdfDelivery] = useState(null);
  const [pdfDispatchNote, setPdfDispatchNote] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true); setError(null);
      try {
        const list = kind === 'delivery'
          ? await receivingAPI.getDeliveries(range)
          : await dispatchAPI.getHistory(range);
        if (!cancelled) setRows(list);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Could not load documents.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [kind, range]);

  const openRow = async (id) => {
    setOpeningId(id); setError(null);
    try {
      if (kind === 'delivery') setPdfDelivery(await receivingAPI.getDeliveryById(id));
      else setPdfDispatchNote(await dispatchAPI.getDispatchNote(id));
    } catch (err) {
      setError(err.message);
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <ManagerLayout>
      <main className="mx-auto w-full max-w-4xl px-4 py-6">
        <h1 className="text-2xl font-medium">Documents</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every generated delivery note and dispatch note, in one place.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-[4px] border p-1">
            {[['delivery', 'Delivery notes'], ['dispatch', 'Dispatch notes']].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => { setRows([]); setKind(id); }}
                className={
                  kind === id
                    ? 'rounded-[4px] bg-[#2b3336] px-3 py-1.5 text-sm font-medium text-white'
                    : 'rounded-[4px] px-3 py-1.5 text-sm text-muted-foreground'
                }
              >
                {label}
              </button>
            ))}
          </div>

          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {error ? <div className="mt-4"><ErrorBanner message={error} /></div> : null}

        <div className="mt-4">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No {kind === 'delivery' ? 'delivery' : 'dispatch'} notes for this range.</p>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {kind === 'delivery' ? (
                        <>
                          <TableHead>Supplier</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Received by</TableHead>
                          <TableHead>Status</TableHead>
                        </>
                      ) : (
                        <>
                          <TableHead>Beneficiary</TableHead>
                          <TableHead>Collected</TableHead>
                          <TableHead>Driver</TableHead>
                          <TableHead>Status</TableHead>
                        </>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => {
                      const id = kind === 'delivery' ? row.id : row.dispatch_event_id;
                      return (
                        <TableRow
                          key={id}
                          className="cursor-pointer"
                          onClick={() => openRow(id)}
                          aria-busy={openingId === id}
                        >
                          {kind === 'delivery' ? (
                            <>
                              <TableCell className="font-medium">{row.supplier_name}</TableCell>
                              <TableCell className="text-muted-foreground">{fmtDate(row.delivery_date)}</TableCell>
                              <TableCell className="text-muted-foreground">{row.received_by_name || '—'}</TableCell>
                              <TableCell><Badge variant="outline">{row.status}</Badge></TableCell>
                            </>
                          ) : (
                            <>
                              <TableCell className="font-medium">{row.ecd_name}</TableCell>
                              <TableCell className="text-muted-foreground">{fmtDate(row.collected_at)}</TableCell>
                              <TableCell className="text-muted-foreground">{row.driver_name || '—'}</TableCell>
                              <TableCell>
                                <Badge variant="outline">
                                  {row.status === 'late_collected' ? 'Late collection' : 'Collected'}
                                </Badge>
                              </TableCell>
                            </>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      {pdfDelivery ? (
        <DeliveryNotePDF delivery={pdfDelivery} onClose={() => setPdfDelivery(null)} />
      ) : null}
      {pdfDispatchNote ? (
        <DispatchNotePDF note={pdfDispatchNote} onClose={() => setPdfDispatchNote(null)} />
      ) : null}
    </ManagerLayout>
  );
}
