// ─────────────────────────────────────────────────────────────
// client/src/lib/pdfTab.js
//
// Opening a generated PDF, the one way, for every screen that makes one.
//
// A tab opened AFTER the work of building the PDF is a pop-up as far
// as the browser is concerned, and a phone blocks it: the worker taps
// View PDF, waits, and gets "pop-up blocked". So the tab is opened
// inside the tap, while the browser still counts it as the person's
// own action, and pointed at the PDF once there is one.
//
// That was first worked out for printing picking slips and lived only
// there. Every other note (delivery, dispatch, decanting, reports)
// still opened its tab afterwards. It is here now so they all do the
// same thing.
//
// When no tab can be had at all the PDF is saved as a file instead,
// which on a phone lands in the share sheet or Files. A note the
// worker cannot open is worse than one that downloads.
// ─────────────────────────────────────────────────────────────

// Call first thing in the click handler, before any await.
export const reservePdfTab = (title = 'Preparing the PDF…') => {
  let tab;
  try { tab = window.open('', '_blank'); } catch { return null; }
  if (tab) {
    try { tab.document.title = title; } catch { /* another origin's blank page */ }
  }
  return tab ?? null;
};

// Shows the PDF in the reserved tab, or saves it when there is none.
// Returns 'opened' or 'saved' so the caller can say which happened.
export const showPdf = (pdf, tab, filename = 'document') => {
  if (tab && !tab.closed) {
    tab.location.href = pdf.output('bloburl');
    return 'opened';
  }
  pdf.save(`${filename}.pdf`);
  return 'saved';
};

// The PDF could not be built: do not leave an empty tab behind.
export const releasePdfTab = (tab) => {
  try { tab?.close(); } catch { /* already gone */ }
};

// The width a note is laid out at for export, whatever the screen.
// 794px is A4 at 96dpi. EXPORT_WINDOW_WIDTH is what the phone-layout
// media queries are evaluated against while rasterising, so a PDF made
// on a phone is the same page a PDF made at a desk is.
export const A4_WIDTH_PX = 794;
export const EXPORT_WINDOW_WIDTH = 1024;

export default { reservePdfTab, showPdf, releasePdfTab, A4_WIDTH_PX, EXPORT_WINDOW_WIDTH };
