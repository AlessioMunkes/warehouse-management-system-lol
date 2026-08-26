// ─────────────────────────────────────────────────────────────
// client/src/features/staff/hooks/usePdfDocument.js
//
// The html2canvas + jsPDF pipeline every staff-facing PDF (delivery
// note, decanting sheet, dispatch note) shares — pulled out of
// DeliveryNotePDF.jsx so the other two don't copy-paste the same
// generation code, and so the fix below only has to exist once.
//
// WHAT THIS FIXES
// The original version rasterised the whole document ONCE, then for
// a note long enough to span more than one A4 page, called
// pdf.addImage with that SAME full-height image on every page, just
// shifted up by -yPos so the right slice happened to line up with
// that page's boundary. That renders correctly, but it means a
// three-page note embeds the ENTIRE document image three times over
// inside the PDF file — most of what made a longer delivery's PDF
// slow to appear, and it made the file itself needlessly large.
//
// This crops each page's own slice onto a small offscreen canvas
// first, so every page only ever embeds the portion of the document
// actually printed on it.
//
// document.fonts.ready is still awaited before capture: html2canvas
// rasterises synchronously and does not wait for the async @import
// font loads in index.css, so without this the browser's fallback
// font gets captured instead of Montserrat/Inter.
// ─────────────────────────────────────────────────────────────
import { useRef, useState } from 'react';
import jsPDF from 'jspdf';
// html2canvas-pro, not html2canvas: the plain package's colour parser
// throws on any oklch()/lab()/lch() value ("Attempting to parse an
// unsupported color function"), and index.css's Tailwind v4 theme
// defines --background/--foreground/etc. as oklch(...) — html2canvas
// clones and walks the WHOLE document (not just documentRef's own
// subtree) while resolving styles, so this fired on every single
// generation, not just ones that happened to reference those
// variables directly. -pro is the actively maintained fork that added
// support for the color spaces Tailwind v4 actually ships with.
import html2canvas from 'html2canvas-pro';

export default function usePdfDocument() {
  const documentRef = useRef(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');

  // bloburl opens in the browser's own PDF viewer — no forced
  // download; the viewer can still save/print from there if needed.
  const openPdf = async () => {
    if (!documentRef.current) return;
    setIsGenerating(true);
    setError('');
    try {
      if (document.fonts?.ready) await document.fonts.ready;

      const canvas = await html2canvas(documentRef.current, {
        scale: 2, useCORS: true, backgroundColor: '#FFFFFF', logging: false,
      });

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidthMm  = pdf.internal.pageSize.getWidth();
      const pageHeightMm = pdf.internal.pageSize.getHeight();

      // Pixels-per-mm at the canvas's own resolution (from the width
      // ratio, since the canvas is always exactly pageWidthMm wide) —
      // this is what turns an A4 page height into a pixel slice height
      // to actually cut the source canvas at.
      const pxPerMm      = canvas.width / pageWidthMm;
      const pageHeightPx = Math.max(1, Math.floor(pageHeightMm * pxPerMm));

      const slice    = document.createElement('canvas');
      const sliceCtx = slice.getContext('2d');
      slice.width = canvas.width;

      let renderedPx = 0;
      let pageIndex  = 0;

      while (renderedPx < canvas.height) {
        const sliceHeightPx = Math.min(pageHeightPx, canvas.height - renderedPx);
        slice.height = sliceHeightPx;
        sliceCtx.clearRect(0, 0, slice.width, slice.height);
        sliceCtx.drawImage(
          canvas,
          0, renderedPx, canvas.width, sliceHeightPx,
          0, 0, canvas.width, sliceHeightPx,
        );

        if (pageIndex > 0) pdf.addPage();
        pdf.addImage(
          slice.toDataURL('image/png'), 'PNG',
          0, 0, pageWidthMm, sliceHeightPx / pxPerMm,
        );

        renderedPx += sliceHeightPx;
        pageIndex  += 1;
      }

      const blobUrl = pdf.output('bloburl');
      const opened  = window.open(blobUrl, '_blank');
      if (!opened) {
        setError('Pop-up blocked — allow pop-ups for this site to view the PDF.');
      }
    } catch (err) {
      console.error('PDF generation failed:', err);
      setError('Could not generate the PDF. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  return { documentRef, isGenerating, error, openPdf };
}
