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
// Deliberately read-only and un-paginated, for the same reason
// StaffDeliveriesPage.jsx is: getDecantingRecords already returns
// everything in the requested range in one call.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StaffShell from '../components/layout/StaffShell';
import DecantingSheetPDF from '../features/decanting/components/DecantingSheetPDF';
import { Notice } from '../features/staff/components/StepPrimitives';
import { getDecantingRecords, getDecantingById } from '../services/decantingAPI';
import { STAFF } from '../routes/paths';

const RANGES = [
  { key: 'today', label: 'Today' },
  { key: 'week',  label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'all',   label: 'All' },
];

const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

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
      <div className="stf-step">
        <div className="stf-step-head">
          <h1 className="stf-step-title" tabIndex={-1}>Past sheets</h1>
          <p className="stf-step-sub">Every decanting sheet that's been recorded, most recent first.</p>
        </div>

        {error ? <Notice tone="warn">{error}</Notice> : null}

        <div className="stf-segments" role="tablist" aria-label="Date range">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              role="tab"
              aria-selected={range === r.key}
              className={`stf-segment${range === r.key ? ' is-active' : ''}`}
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="stf-skeleton" aria-label="Loading" />
        ) : records.length === 0 ? (
          <div className="stf-empty">
            No decanting sheets recorded in this range yet.
          </div>
        ) : (
          <div className="stf-list">
            {records.map((record) => (
              <div key={record.id} className="stf-row is-static">
                <span className="stf-row-main">
                  <span className="stf-row-title">Week of {formatDate(record.week_of)}</span>
                  <span className="stf-row-meta">
                    {formatDate(record.created_at)}
                    {record.recorded_by_name ? ` · Recorded by ${record.recorded_by_name}` : ''}
                    {` · ${record.line_count} line${Number(record.line_count) === 1 ? '' : 's'}`}
                  </span>
                </span>
                {Number(record.total_wastage_kg) > 0 ? (
                  <span className="stf-badge is-warn">
                    {record.total_wastage_kg} kg wastage
                  </span>
                ) : null}
                <button
                  type="button"
                  className="stf-btn stf-btn-secondary"
                  onClick={() => openPdf(record.id)}
                  disabled={openingId === record.id}
                >
                  {openingId === record.id ? 'Opening…' : 'View sheet'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {pdfRecord ? (
        <DecantingSheetPDF record={pdfRecord} onClose={() => setPdfRecord(null)} />
      ) : null}
    </StaffShell>
  );
}
