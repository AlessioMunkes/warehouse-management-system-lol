// ─────────────────────────────────────────────────────────────
// client/src/features/reporting/components/ImpactCalculatorPDF.jsx
//
// A shareable, poster-style export of the Impact Calculator — a
// cover page carrying all four headline numbers as one 2x2 grid of
// illustrated cards (same composition as the on-screen poster cards,
// ImpactStatCard.jsx), plus a closing "beneficiaries by type"
// comparison page. Replaces an earlier single-page table version that
// carried numbers but none of the imagery, and a version after that
// which gave each number its own full page — four numbers do not
// need six pages between them, and each one mostly empty read as
// broken rather than spacious.
//
// Each .pdf-poster-page is a fixed 794x1123px (A4 at 96dpi, matching
// .pdf-document's own fixed 794px width) — see receipts.css's POSTER
// PAGES note for why that has to be exact: PdfShell's "View PDF"
// button rasterises the whole document as one canvas and slices it
// into PDF pages by pixel height alone, with no idea where a section
// starts or ends, so a page that isn't exactly one A4 page tall
// bleeds into the next one.
//
// Page content is positioned with fixed margins, not flexbox
// vertical centering — an earlier version tried to centre each
// page's content in the available height and it did not survive
// html2canvas, rendering with everything pinned to the top and the
// whole rest of the page empty. See receipts.css's own note on
// .pdf-poster-page.
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
        <div className="pdf-poster-page">
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

          <div className="pdf-poster-grid">
            {pdfStats.map((s) => (
              <div key={s.label} className="pdf-poster-card">
                <div className="pdf-poster-illustration">
                  {s.image ? <img src={s.image} alt="" /> : null}
                </div>
                <p className="pdf-poster-label">{s.label}</p>

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
          </div>
        </div>

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
            <p className="pdf-poster-footnote">
              Children are headcounted while adults are estimated, converted via kilograms
              dispatched per kitchen. Dignity kitchen guests and households are estimated the
              same way, per kitchen and per community request.
            </p>
          </div>
        ) : null}
      </div>
    </PdfShell>
  );
};

export default ImpactCalculatorPDF;
