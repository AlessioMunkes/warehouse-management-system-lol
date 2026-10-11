// ─────────────────────────────────────────────────────────────
// client/src/features/reporting/OperationsReportPDF.jsx
//
// The Operations report as a printable document: letterhead, title and
// period, then the same report body as the screen, charts included. It
// is laid out by NoteSheet, like the delivery and dispatch notes.
// The colours are fixed to the light theme (.op-pdf) so a report made in
// dark mode still prints dark text on white paper.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import NoteSheet from '../receipts/NoteSheet';
import { useAuth } from '../../context/AuthContext';

const fmtDate = (iso) => (iso
  ? new Date(`${String(iso).slice(0, 10)}T00:00:00`).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })
  : null);

const periodOf = (data) => {
  const r = data.report?.spec?.dateRange ?? data.listRange;
  if (!r?.from || !r?.to) return 'Current position';
  return `${fmtDate(r.from)} – ${fmtDate(r.to)}`;
};

const slug = (s) => String(s ?? 'report').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

export default function OperationsReportPDF({ data, narrative, onClose, renderBody }) {
  const { user } = useAuth() ?? {};
  const title = data.report.description;
  // The server stamps every insight; the fallback is when this opened.
  const [generated] = useState(() => new Date(data.generatedAt ?? Date.now()));
  const preparedBy = [user?.firstName, user?.lastName].filter(Boolean).join(' ');
  const site = user?.warehouses?.find((w) => w.code === user?.warehouse)?.name;

  const meta = [
    ['Period', periodOf(data)],
    ['Generated', generated.toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })],
    preparedBy && ['Prepared by', preparedBy],
    site && ['Warehouse', site],
  ].filter(Boolean);

  // Laid out by NoteSheet, the layout every note and report shares:
  // the same title, letterhead and details box as the dispatch note.
  return (
    <NoteSheet
      title="Operations Report"
      toolbarTitle={`OPERATIONS REPORT - ${title}`}
      filename={`operations-report-${slug(title)}-${generated.toISOString().slice(0, 10)}`}
      onClose={onClose}
      meta={meta.map(([label, value]) => ({ label, value }))}
    >
      <div className="op-pdf">
        <h2 className="op-pdf-report-title">{title}</h2>

        <div className="op-pdf-body">
          {renderBody({ data, narrative })}
        </div>

        {data.report.meta?.caveat && (
          <p className="op-pdf-caveat"><strong>Note:</strong> {data.report.meta.caveat}</p>
        )}

        <footer className="op-pdf-footer">
          <span>Ladles of Love · Operations report</span>
          <span>Produced from the warehouse management system. Figures as at {generated.toLocaleDateString('en-ZA')}.</span>
        </footer>
      </div>
    </NoteSheet>
  );
}
