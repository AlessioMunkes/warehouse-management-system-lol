// ─────────────────────────────────────────────────────────────
// client/src/pages/StaffDecantingRecordsPage.jsx
//
// The decanting equivalent of StaffDeliveriesPage.jsx: every sheet
// already saved, filterable by how far back to look, each one
// openable as the same DecantingSheetPDF that pops up right after a
// save in DecantingFlow. Reached from a "History" link on Decanting's
// crumb bar, not its own tab bar slot — DecantingPage already IS the
// one URL every worker reaches decanting through (see routes/paths.js
// for why the tab bar has no spare slot for a sixth item).
//
// Read-only, for the same reason StaffDeliveriesPage.jsx is:
// getDecantingRecords returns everything in the requested range in one
// call, and HistoryScreen sorts and filters it in the browser.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StaffShell from '../components/layout/StaffShell';
import DecantingSheetPDF from '../features/decanting/DecantingSheetPDF';
import { getDecantingRecords, getDecantingById } from '../services/decantingAPI';
import { STAFF } from '../routes/paths';
import HistoryScreen, { HistoryRow } from '../features/staff/HistoryScreen';
import { byNewest, byOldest, byNumber } from '../features/staff/historyView';
import StatusBadge from '@/components/ui/status-badge';
import { workerStatus } from '../features/staff/workerStatus';
import { formatShortDate as formatDate } from '@/lib/dates';

const dateOf = (r) => r.created_at ?? r.week_of;

const SORTS = [
  { key: 'newest', label: 'Newest first', compare: byNewest(dateOf) },
  { key: 'oldest', label: 'Oldest first', compare: byOldest(dateOf) },
  { key: 'bags', label: 'Most bags', compare: byNumber((r) => r.total_bags) },
  { key: 'wastage', label: 'Most wastage', compare: byNumber((r) => r.total_wastage_kg) },
];
const FILTERS = [
  {
    key: 'wastage', label: 'Wastage',
    valueOf: (r) => (Number(r.total_wastage_kg) > 0 ? 'some' : 'none'),
    labelOf: (v) => (v === 'some' ? 'Some wastage' : 'No wastage'),
  },
  { key: 'recordedBy', label: 'Recorded by', valueOf: (r) => r.recorded_by_name },
];
const searchText = (r) => [r.recorded_by_name, `week of ${formatDate(r.week_of)}`].filter(Boolean).join(' ');

export default function StaffDecantingRecordsPage() {
  const navigate = useNavigate();
  const [range, setRange] = useState('week');
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openingId, setOpeningId] = useState(null);
  const [pdfRecord, setPdfRecord] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const list = await getDecantingRecords(range);
        if (!cancelled) setRecords(list);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [range]);

  const openPdf = async (id) => {
    setOpeningId(id);
    setError(null);
    try {
      const full = await getDecantingById(id);
      setPdfRecord(full);
    } catch (err) {
      setError(err.message);
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <StaffShell
      crumb="Decanting / Past sheets"
      onBack={() => navigate(STAFF.decanting)}
    >
      <HistoryScreen
        title="Past sheets"
        sub="Every decanting sheet that's been recorded."
        error={error}
        range={range}
        onRangeChange={setRange}
        loading={loading}
        rows={records}
        search={searchText}
        searchPlaceholder="Search by name or week"
        searchId="stf-sheets-search"
        sorts={SORTS}
        filters={FILTERS}
        empty="No decanting sheets recorded in this range yet."
        noun="sheets"
        renderRow={(record) => (
          <HistoryRow
            title={`Week of ${formatDate(record.week_of)}`}
            meta={[
              formatDate(record.created_at),
              record.recorded_by_name ? `Recorded by ${record.recorded_by_name}` : null,
              `${record.line_count} line${Number(record.line_count) === 1 ? '' : 's'}`,
            ].filter(Boolean).join(' · ')}
            badges={Number(record.total_wastage_kg) > 0 ? (
              <StatusBadge {...workerStatus('note', 'wastage')}>
                {record.total_wastage_kg} kg wastage
              </StatusBadge>
            ) : null}
            action={{ label: 'View sheet', onClick: () => openPdf(record.id), busy: openingId === record.id }}
          />
        )}
      />

      {pdfRecord ? (
        <DecantingSheetPDF record={pdfRecord} onClose={() => setPdfRecord(null)} />
      ) : null}
    </StaffShell>
  );
}
