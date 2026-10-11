// ─────────────────────────────────────────────────────────────
// client/src/features/receipts/NoteSheet.jsx
//
// The one layout every note in the system is printed in: delivery note,
// dispatch note, decanting sheet. The dispatch note was the one people
// liked, so this is that note with its contents taken out: the same
// toolbar, the big title over a red rule, the warehouse and the other
// party on the left, the grey details box on the right, the line of
// additional information, a light table and the signatures.
//
// A note supplies what differs and nothing else:
//
//   title         "Dispatch Note"
//   toolbarTitle  "DISPATCH NOTE #2556 - Andi's Educare"
//   filename      what the PDF is saved as, without ".pdf"
//   party         { heading: 'To', name, lines: [] } or null
//   meta          [{ label, value, tone }]   tone: 'complete' | 'partial'
//   info          the sentence under "Additional information"
//   children      the table, and <NoteSignatures> when there are any
//
// There were three copies of this markup, one per note, and a fourth,
// different layout (PdfShell's) for the delivery note and the manager's
// dispatch note. A fix made to one was not made to the others.
//
// Rendered into document.body so it sits above whatever screen opened
// it, whichever shell that screen lives in.
// ─────────────────────────────────────────────────────────────
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import usePdfDocument from '../staff/usePdfDocument';
import { WAREHOUSE } from './noteFormat';
import '../../styles/deliveryNotePDF.css';

const PDF_LOGO_URL = '/images/pdf_logo.png';


const TONE = { complete: 'pdfnote-status-complete', partial: 'pdfnote-status-partial' };

export default function NoteSheet({
  title, toolbarTitle, filename = 'document', party = null, meta = [], info, onClose, children,
}) {
  const { documentRef, isGenerating, error: genError, openPdf } = usePdfDocument();

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // The page behind keeps scrolling under the note otherwise, which on
  // a phone means the note drifts away while it is being read.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);

  const sheet = (
    <div className="pdfnote-modal" role="dialog" aria-modal="true" aria-label={toolbarTitle}>
      <div className="pdfnote-toolbar">
        <span className="pdfnote-toolbar-title">{toolbarTitle}</span>
        <div className="pdfnote-toolbar-actions">
          {genError ? <span className="pdfnote-toolbar-error">{genError}</span> : null}
          <button
            type="button"
            onClick={() => openPdf(filename)}
            disabled={isGenerating}
            className="btn-primary btn-sm"
          >
            {isGenerating ? 'GENERATING...' : '⤢ VIEW PDF'}
          </button>
          <button type="button" onClick={onClose} className="btn-ghost">✕ CLOSE</button>
        </div>
      </div>

      <div className="pdfnote-scroll-area">
        <div className="pdfnote-document" ref={documentRef}>
          <div className="pdfnote-doc-header">
            <div>
              <div className="pdfnote-doc-title-tick" />
              <h1 className="pdfnote-doc-title">{title}</h1>
            </div>
            <img src={PDF_LOGO_URL} alt="" className="pdfnote-doc-logo" aria-hidden="true" />
          </div>
          <div className="pdfnote-doc-rule" />

          <div className="pdfnote-doc-parties">
            <div className="pdfnote-doc-party-col">
              <div className="pdfnote-doc-party">
                <p className="pdfnote-doc-party-heading">{WAREHOUSE.name}</p>
                {WAREHOUSE.addressLines.map((line) => (
                  <p key={line} className="pdfnote-doc-party-line">{line}</p>
                ))}
              </div>
              {party ? (
                <div className="pdfnote-doc-party">
                  <p className="pdfnote-doc-party-heading">{party.heading}</p>
                  <p className="pdfnote-doc-party-line pdfnote-doc-party-line--primary">{party.name || '-'}</p>
                  {(party.lines || []).filter(Boolean).map((line) => (
                    <p key={line} className="pdfnote-doc-party-line">{line}</p>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="pdfnote-doc-meta-box">
              {meta.filter(Boolean).map((row) => (
                <p key={row.label} className="pdfnote-doc-meta-line">
                  <span>{row.label}</span>
                  <strong className={TONE[row.tone]}>{row.value ?? '-'}</strong>
                </p>
              ))}
            </div>
          </div>

          {info ? (
            <div className="pdfnote-doc-additional">
              <p className="pdfnote-doc-section-heading">Additional information</p>
              <p className="pdfnote-doc-additional-text">{info}</p>
            </div>
          ) : null}

          {children}
        </div>
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}

// The two blocks at the foot of a note. `signed` is the outside party,
// who signs; `by` is the warehouse's own person, who is only named:
// they were signed in, so there is no second signature to collect.
//
//   signed  { label, image, name }
//   by      { label, name }
export function NoteSignatures({ signed, by }) {
  return (
    <div className="pdfnote-signature-section">
      {signed ? (
        <div className="pdfnote-signature-block">
          <p className="pdfnote-signature-label">{signed.label}</p>
          {signed.image
            ? <img src={signed.image} alt={signed.label} className="pdfnote-signature-img" />
            : <div className="pdfnote-signature-line" />}
          {signed.name ? <p className="pdfnote-signature-name">{signed.name}</p> : null}
        </div>
      ) : null}
      {by ? (
        <div className="pdfnote-signature-block">
          <p className="pdfnote-signature-label">{by.label}</p>
          <p className="pdfnote-signature-name pdfnote-signature-name--standalone">{by.name}</p>
        </div>
      ) : null}
    </div>
  );
}
