// ─────────────────────────────────────────────────────────────
// client/src/features/receipts/components/PdfShell.jsx
//
// The modal, toolbar, PDF export and print behaviour shared by
// DeliveryNotePDF and DispatchNotePDF.
//
// ── WHY THE SWEEP COVERS THE WHOLE CLONED DOCUMENT ───────────
// html2canvas 1.4.1 predates oklch() and color-mix() and throws on
// both. index.css applies `border-border outline-ring/50` to every
// element AND `bg-background text-foreground` to body, all of which
// resolve to oklch.
//
// An earlier version of this file sanitised only the note's own
// subtree. That was not enough: html2canvas reads the cloned
// document's html and body to work out the canvas background, so
// body's oklch background still killed the render before the note
// was reached.
//
// The clone is discarded immediately after rasterising, so sweeping
// all of it is free and cannot affect the visible page.
//
// ── WHY THIS RENDERS THROUGH A PORTAL ────────────────────────
// Print needs to hide the page behind the note. That needs a sibling
// selector, and inside the React tree this component has no useful
// siblings. Rendering into document.body makes
// `body > *:not(.pdf-modal) { display: none }` work — see the print
// block in receipts.css. A portal is also simply correct for a
// modal: it escapes any ancestor stacking or overflow context.
//
// ── LONGER TERM ──────────────────────────────────────────────
// Rasterising a DOM node is the fragile way to make a PDF: the
// output is a picture of text, so it is large, unsearchable, and
// breaks whenever CSS moves ahead of html2canvas, which is
// unmaintained. Both notes are a meta grid, a table and two
// signature blocks — jsPDF can draw them directly from the data.
// ─────────────────────────────────────────────────────────────
import { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// Colour functions html2canvas 1.4.1 cannot parse.
const UNSUPPORTED = /(oklch|oklab|color-mix|\blab\(|\blch\()/i;

// Properties html2canvas reads per node, each with a safe hex fallback.
// The fallback is only applied when the computed value actually contains an
// unsupported function, so the note's own hex values are left alone.
const COLOUR_PROPS = {
  'color':                   '#2b3336',
  'background-color':        '#ffffff',
  'border-top-color':        '#e9e3dd',
  'border-right-color':      '#e9e3dd',
  'border-bottom-color':     '#e9e3dd',
  'border-left-color':       '#e9e3dd',
  'outline-color':           'transparent',
  'text-decoration-color':   '#2b3336',
  'column-rule-color':       '#e9e3dd',
  '-webkit-text-fill-color': '#2b3336',
  'fill':                    '#2b3336',
  'stroke':                  '#2b3336',
};

// A fallback colour is meaningless for these — they are removed instead.
const DROP_PROPS = ['box-shadow', 'background-image'];

const sanitiseClonedDocument = (clonedDoc) => {
  const view = clonedDoc.defaultView || window;

  // A stylesheet first, so anything the per-node pass misses — pseudo
  // elements, which getComputedStyle on the element does not report — still
  // resolves to something parseable. Deliberately narrow: only properties the
  // note never uses decoratively, so nothing visible changes.
  try {
    const reset = clonedDoc.createElement('style');
    reset.textContent = [
      'html, body { background-color: #ffffff !important; color: #2b3336 !important; }',
      '*, *::before, *::after { outline-color: transparent !important; }',
    ].join('\n');
    clonedDoc.head?.appendChild(reset);
  } catch {
    // A missing head is not worth failing the export over.
  }

  const nodes = [
    clonedDoc.documentElement,
    clonedDoc.body,
    ...clonedDoc.querySelectorAll('*'),
  ].filter(Boolean);

  for (const node of nodes) {
    let computed;
    try {
      computed = view.getComputedStyle(node);
    } catch {
      continue;   // detached or unreadable — skip rather than fail the export
    }
    if (!computed) continue;

    for (const prop in COLOUR_PROPS) {
      const value = computed.getPropertyValue(prop);
      if (value && UNSUPPORTED.test(value)) {
        node.style.setProperty(prop, COLOUR_PROPS[prop], 'important');
      }
    }
    for (const prop of DROP_PROPS) {
      const value = computed.getPropertyValue(prop);
      if (value && UNSUPPORTED.test(value)) {
        node.style.setProperty(prop, 'none', 'important');
      }
    }
  }
};

export default function PdfShell({ title, filename, onClose, children }) {
  const documentRef = useRef(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genError, setGenError] = useState('');

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // The page behind the modal keeps scrolling under it otherwise, which on a
  // phone means the note drifts away while you are reading it.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);

  const handleViewPdf = async () => {
    if (!documentRef.current) return;
    setIsGenerating(true);
    setGenError('');
    try {
      const canvas = await html2canvas(documentRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#FFFFFF',
        logging: false,
        // Runs against html2canvas's internal clone, before it rasterises.
        // Mutating the clone leaves the visible page untouched.
        onclone: (clonedDoc) => sanitiseClonedDocument(clonedDoc),
      });

      const imgData    = canvas.toDataURL('image/png');
      const pdf        = new jsPDF('p', 'mm', 'a4');
      const pageWidth  = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth   = pageWidth;
      const imgHeight  = (canvas.height * imgWidth) / canvas.width;

      let yPos = 0;
      while (yPos < imgHeight) {
        if (yPos > 0) pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, -yPos, imgWidth, imgHeight);
        yPos += pageHeight;
      }

      const blobUrl = pdf.output('bloburl');
      const opened  = window.open(blobUrl, '_blank');
      if (!opened) {
        setGenError('Pop-up blocked — allow pop-ups for this site, or use Print.');
      }
    } catch (err) {
      // The real message. When this failed on every record the UI said only
      // "please try again", which told nobody anything.
      console.error('PDF generation failed:', err);
      const detail = (err && err.message ? String(err.message) : 'Unknown error').slice(0, 140);
      setGenError(`PDF failed: ${detail}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // The browser's own renderer, so it cannot fail the way html2canvas can.
  // receipts.css hides everything except this modal while printing.
  const handlePrint = () => window.print();

  const modal = (
    <div className="pdf-modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="pdf-toolbar">
        <span className="pdf-toolbar-title">{title}</span>
        <div className="pdf-toolbar-actions">
          {genError && <span className="pdf-toolbar-error">{genError}</span>}
          <button
            type="button"
            onClick={handleViewPdf}
            disabled={isGenerating}
            className="rounded-[4px] border-2 border-transparent bg-[#ef3a40] px-4 py-1.5 text-xs font-bold tracking-wider text-white disabled:opacity-60"
          >
            {isGenerating ? 'GENERATING…' : 'VIEW PDF'}
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="rounded-[4px] border-2 border-white/30 px-4 py-1.5 text-xs font-bold tracking-wider text-white"
          >
            PRINT
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[4px] border-2 border-white/30 px-4 py-1.5 text-xs font-bold tracking-wider text-white"
          >
            CLOSE
          </button>
        </div>
      </div>

      <div className="pdf-scroll-area">
        {/* data-pdf-root marks the note itself. The sweep no longer needs it
            to find the subtree, but the print rules and any future tooling do. */}
        <div
          className="pdf-document"
          ref={documentRef}
          data-pdf-root=""
          data-filename={filename}
        >
          {children}
        </div>
      </div>
    </div>
  );

  // Into document.body, not into the React tree. See the header note.
  return createPortal(modal, document.body);
}
