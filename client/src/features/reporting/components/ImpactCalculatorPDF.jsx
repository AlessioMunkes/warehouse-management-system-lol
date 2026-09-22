// ─────────────────────────────────────────────────────────────
// client/src/features/reporting/components/ImpactCalculatorPDF.jsx
//
// A shareable, poster-style export of the Impact Calculator — a
// cover page, one full page per headline number (its own
// illustration, its own elaborated caption and methodology note),
// and a closing "beneficiaries by type" comparison page. Replaces an
// earlier single-page table version that carried numbers but none of
// the imagery or context the on-screen page has.
//
// Each .pdf-poster-page is a fixed 794x1123px (A4 at 96dpi, matching
// .pdf-document's own fixed 794px width) — see receipts.css's POSTER
// PAGES note for why that has to be exact: PdfShell's "View PDF"
// button rasterises the whole document as one canvas and slices it
// into PDF pages by pixel height alone, with no idea where a section
// starts or ends, so a page that isn't exactly one A4 page tall
// bleeds into the next one.
// ─────────────────────────────────────────────────────────────
import PdfShell from '../../receipts/components/PdfShell';
import { formatDate, formatDateTime } from '../../receipts/components/noteFormat';

const fmtNum = (n) => Math.round(Number(n) || 0).toLocaleString('en-ZA');

const ImpactCalculatorPDF = ({ pdfStats, beneficiaryTypeStats, dateRange, onClose }) => {
  if (!pdfStats) return null;

  const maxBeneficiaryValue = Math.max(
    ...(beneficiaryTypeStats ?? [])
      .map((i) => i.stat)
      .filter((s) => s && !s.notReady && !s.error)
      .map((s) => s.value),
    1
  );

  return (
    <PdfShell
      title="IMPACT CALCULATOR"
      filename={`impact-calculator-${dateRange.from}_${dateRange.to}`}
      onClose={onClose}
    >
      <div className="pdf-poster">
        {/* ── Page 1: cover ─────────────────────────────────── */}
        <div className="pdf-poster-page pdf-poster-cover">
          <div className="pdf-doc-header">
            <div>
              <h1 className="pdf-doc-title">IMPACT CALCULATOR</h1>
              <p className="pdf-doc-subtitle">Ladles of Love · Nourish Our Children</p>
              <p className="pdf-doc-subtitle">Warehouse Management System</p>
            </div>
            <div>
              <p className="pdf-doc-id-label">Period</p>
              <p className="pdf-doc-id">
                {formatDate(dateRange.from)} – {formatDate(dateRange.to)}
              </p>
              <p className="pdf-doc-id-label pdf-doc-id-label--spaced">
                Generated: {formatDateTime(new Date().toISOString())}
              </p>
            </div>
          </div>

          <div className="pdf-poster-cover-stats">
            {pdfStats.map((s) => (
              <div key={s.label} className="pdf-poster-cover-stat">
                <p className="pdf-poster-cover-stat-value" style={{ color: s.color }}>
                  {s.available ? fmtNum(s.value) : '—'}
                </p>
                <p className="pdf-poster-cover-stat-label">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── One page per headline number ─────────────────── */}
        {pdfStats.map((s) => (
          <div key={s.label} className="pdf-poster-page pdf-poster-stat">
            <p className="pdf-poster-label">{s.label}</p>

            <div className="pdf-poster-illustration">
              {s.image ? <img src={s.image} alt="" /> : null}
            </div>

            {s.available ? (
              <>
                <p className="pdf-poster-value" style={{ color: s.color }}>{fmtNum(s.value)}</p>
                <p className="pdf-poster-unit">{s.unit}</p>
                {s.caption ? <p className="pdf-poster-caption">{s.caption}</p> : null}
              </>
            ) : (
              <p className="pdf-poster-caption">{s.caveat || 'Not available for this period.'}</p>
            )}

            {s.available && s.caveat ? <p className="pdf-poster-caveat">{s.caveat}</p> : null}
          </div>
        ))}

        {/* ── Closing page: beneficiaries by type ──────────── */}
        {beneficiaryTypeStats?.length ? (
          <div className="pdf-poster-page">
            <p className="pdf-poster-label">Beneficiaries by type</p>
            <div className="pdf-poster-compare">
              {beneficiaryTypeStats.map(({ metric, label, unit, color, stat }) => (
                <div key={metric} className="pdf-poster-compare-item">
                  <div className="pdf-poster-compare-head">
                    <span>{label}</span>
                    <span style={{ color: '#676767' }}>
                      {!stat || stat.notReady || stat.error ? '—' : `${fmtNum(stat.value)} ${unit}`}
                    </span>
                  </div>
                  <div className="pdf-poster-compare-track">
                    {stat && !stat.notReady && !stat.error ? (
                      <div
                        className="pdf-poster-compare-fill"
                        style={{
                          width: `${Math.max((stat.value / maxBeneficiaryValue) * 100, 3)}%`,
                          backgroundColor: color,
                        }}
                      />
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
            <p className="pdf-poster-caveat">
              Children is a real headcount. Adults, dignity kitchen guests and community
              requests are estimates converted from kilograms dispatched.
            </p>
          </div>
        ) : null}
      </div>
    </PdfShell>
  );
};

export default ImpactCalculatorPDF;
