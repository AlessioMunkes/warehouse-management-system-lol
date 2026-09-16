// ─────────────────────────────────────────────────────────────
// client/src/features/packing/palletLabelPdf.js
//
// The printable QR label a manager tapes to a pallet, and that a Love
// Activist scans to open it (BR-22).
//
// ── WHY THIS DOES NOT USE usePdfDocument.js ──────────────────
// Every other PDF here (delivery note, dispatch note, decanting sheet)
// goes through usePdfDocument: html2canvas rasterises a DOM node and
// the PNG is embedded in a jsPDF page. That is the right tool for a
// document that is already a laid-out table. It is the wrong tool for
// this, for four reasons:
//
//   1. A QR is read by a camera. Scan reliability depends on crisp
//      module edges, and that pipeline captures at scale:2 of CSS
//      pixels and then resamples to A4 millimetres. Every resample
//      softens exactly the edges the scan depends on. Drawing the
//      modules as vector rectangles gives mathematically exact edges
//      at any print size, on any printer.
//
//   2. PdfShell.jsx's own "LONGER TERM" note already says this is the
//      better path: "Rasterising a DOM node is the fragile way to make
//      a PDF ... jsPDF can draw them directly from the data." A label
//      is five strings and one graphic — the easiest possible case.
//
//   3. The batch is one page per pallet. Rasterising would embed a
//      full-page PNG per slip; twenty pallets is twenty large images in
//      one file. Drawn directly, the whole batch is a few KB.
//
//   4. That pipeline needs a mounted, visible DOM node to rasterise.
//      The batch has no DOM — it runs straight from the slip rows.
//
// Same jsPDF dependency as everything else. No second PDF library.
//
// ── NOT STORED ───────────────────────────────────────────────
// Generated on demand from public_token, which is already on the row.
// Nothing is persisted. The token never changes, so a reprint is
// byte-identical, and there is no stored file that can go stale against
// a regenerated slip and send a volunteer to the wrong pallet.
// ─────────────────────────────────────────────────────────────
// Named import, not the default. jspdf v4's default export is an object
// of its various classes; `jsPDF` is the constructor. The other PDF
// files here use the default import and work because the bundler's CJS
// interop papers over it — the named form is simply correct, and it also
// runs under plain node, which is what makes this module testable
// without a browser.
import { jsPDF } from 'jspdf';
import qrcode from 'qrcode-generator';

// ── Page geometry, in mm ──────────────────────────────────────
// A4 portrait. The QR is the point of the page, so it gets the space:
// a small code marooned in white is both hard to scan and a waste of
// paper.
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 18;

// ~15cm square. Sized to fill the printable width (210 - 2x18 = 174mm)
// with a margin either side, rather than to some arbitrary number. A
// small code marooned on a mostly blank A4 page is both harder to scan
// and a waste of a sheet of paper; this makes the page look deliberate
// and is comfortably readable standing over a pallet.
const QR_SIZE = 150;

// Error correction level Q (25%).
//
// Not the usual M. This is taped to a pallet, handled all day, scuffed,
// and torn at a corner by the time someone scans it. Q keeps it
// readable with a quarter of the code damaged, for a slightly denser
// grid that costs nothing at this print size.
const ECC_LEVEL = 'Q';

// Type number 0 = "pick the smallest version that fits". A slip URL is
// short, so this stays a low-density grid with large modules.
const TYPE_NUMBER = 0;

// The last 6 hex characters of the uuid, which is what the short-code
// lookup matches on. Printed under the QR as the fallback for anyone
// who cannot scan — a volunteer with no camera, a cracked lens, or no
// idea what a QR code is.
export const shortCodeOf = (token) => String(token || '').slice(-6).toLowerCase();

// ── Where a printed label points ──────────────────────────────
// This is the one value on the page that cannot be checked by reading
// it: a label pointing at a dead host looks perfectly fine until a
// volunteer scans it in a warehouse.
//
// So it is DERIVED, never written down. Render deploys the API and the
// client as one service from one origin (see render.yaml), so the page
// doing the printing is already served from the host the label must
// point at — window.location.origin is therefore right by construction
// in every deployed environment, and stays right if the Render URL
// changes or a custom domain is put in front of it.
//
// VITE_PUBLIC_APP_ORIGIN overrides it, for the one case the derivation
// cannot cover: printing from one host for a volunteer who will scan on
// another (a custom domain added in front of the Render URL, say).
// Same shape as API_BASE in services/api.js.
//
// Resolves to:
//   dev      http://localhost:5173   (the Vite origin — correct; the
//                                     /slip route is a client route)
//   Render   https://<service>.onrender.com
//   override whatever VITE_PUBLIC_APP_ORIGIN is set to
export const publicAppOrigin = () => {
  const configured =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_PUBLIC_APP_ORIGIN) || '';
  const fromBrowser =
    (typeof window !== 'undefined' && window.location?.origin) || '';
  // Trailing slash stripped, or the URL ends up with a double slash
  // before /slip and some scanners present that as a different link.
  return String(configured || fromBrowser).replace(/\/+$/, '');
};

// ── Will a printed label actually work? ───────────────────────
// A label is scanned by a volunteer's phone, on the warehouse wi-fi or
// on mobile data. That phone can only reach a publicly routable host.
// If the manager is printing from a dev server, or from a machine on
// the office LAN, the code resolves to an address that exists only on
// THAT computer — the label looks perfect and simply fails when scanned.
//
// The system knows which case it is in, so it should say so rather than
// printing an address at a manager and leaving them to work it out.
//
// Deliberately a allow-nothing-by-default check on the HOST only: an
// unfamiliar host is treated as reachable, because the failure mode of
// a false warning (a manager doubts a label that is fine) is milder
// than the alternative wording implies, and a real deployment must not
// be nagged.
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);

export const isReachableByPhone = (origin) => {
  const value = String(origin || '').trim();
  if (!value) return false;                 // nothing to point at

  let host;
  try {
    host = new URL(value).hostname.toLowerCase();
  } catch {
    return false;                           // not a usable address
  }

  if (LOCAL_HOSTNAMES.has(host)) return false;
  if (host.endsWith('.local')) return false;          // mDNS / Bonjour
  if (host.endsWith('.internal')) return false;

  // RFC1918 private ranges + link-local: reachable from the office LAN,
  // not from a phone on mobile data, and not from a visitor's phone.
  if (/^10\./.test(host)) return false;
  if (/^192\.168\./.test(host)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
  if (/^169\.254\./.test(host)) return false;

  // A bare hostname with no dot is a LAN machine name, not a domain.
  if (!host.includes('.')) return false;

  return true;
};

// The URL the QR resolves to. Absolute, because the scan happens in a
// camera app that has no page context to resolve a relative path
// against.
export const slipUrlFor = (token, origin) =>
  `${(origin || publicAppOrigin()).replace(/\/+$/, '')}/slip/${token}`;

// ── The QR itself ─────────────────────────────────────────────
// Drawn as one filled rectangle per dark module. jsPDF rectangles are
// vector, so the code stays exact at any zoom and on any printer,
// rather than being an image of a code.
//
// Modules are drawn at a deliberately over-wide size (a hair over the
// exact module pitch) so neighbouring dark modules meet with no hairline
// gap between them. Some PDF rasterisers leave a white seam between
// exactly-adjacent fills, and a seam through a QR is read as light
// modules — the one artefact that actually breaks a scan.
const drawQr = (pdf, text, x, y, size) => {
  const qr = qrcode(TYPE_NUMBER, ECC_LEVEL);
  qr.addData(text);
  qr.make();

  const count = qr.getModuleCount();
  const pitch = size / count;
  const fill = pitch * 1.02;

  pdf.setFillColor(0, 0, 0);
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (qr.isDark(row, col)) {
        pdf.rect(x + col * pitch, y + row * pitch, fill, fill, 'F');
      }
    }
  }
  return { moduleCount: count };
};

// Wrap a long beneficiary name onto at most two lines rather than
// letting jsPDF run it off the page. A name that still will not fit is
// shrunk a step, never truncated — a volunteer matches the label to the
// pallet by this name.
const drawBeneficiary = (pdf, name, centreX, y, maxWidth) => {
  let size = 26;
  let lines = pdf.splitTextToSize(name, maxWidth);

  while (lines.length > 2 && size > 16) {
    size -= 2;
    pdf.setFontSize(size);
    lines = pdf.splitTextToSize(name, maxWidth);
  }

  pdf.setFontSize(size);
  pdf.setFont('helvetica', 'bold');
  lines.slice(0, 2).forEach((line, i) => {
    pdf.text(line, centreX, y + i * (size * 0.42), { align: 'center' });
  });
  return y + (Math.min(lines.length, 2) - 1) * (size * 0.42);
};

// ── One label, one page ───────────────────────────────────────
const drawLabel = (pdf, slip, origin) => {
  const centreX = PAGE_W / 2;
  const token = slip.public_token;
  const url = slipUrlFor(token, origin);
  const code = shortCodeOf(token);

  // 1. What scanning this does.
  //
  // The partner VMS also prints QR codes, for volunteer attendance
  // check-in, and both end up on paper in the same warehouse on the
  // same day scanned by the same people. Someone who scans this
  // believing they have checked in for a shift has NOT checked in, and
  // may not find out until they are marked absent.
  //
  // So this says what it does, in these words, above the code — never
  // "check in", "sign in", "register" or "arrival".
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(19);
  pdf.setTextColor(0, 0, 0);
  pdf.text('SCAN TO OPEN THIS PALLET', centreX, MARGIN + 8, { align: 'center' });

  // 2. Who the food is for — large, so the label can be matched to the
  //    pallet standing in front of you without scanning anything.
  const nameBottom = drawBeneficiary(
    pdf,
    slip.beneficiary_name || slip.ecd_name || 'Community partner',
    centreX, MARGIN + 26, PAGE_W - MARGIN * 2,
  );

  // 3. The code itself, centred, given the room.
  const qrY = nameBottom + 12;
  drawQr(pdf, url, centreX - QR_SIZE / 2, qrY, QR_SIZE);

  // 4. The typed fallback, large and legible. This is the accessibility
  //    route for anyone who cannot scan, so it is not shrunk to make
  //    space for anything else.
  const codeY = qrY + QR_SIZE + 18;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(12);
  pdf.setTextColor(60, 60, 60);
  pdf.text('Cannot scan? Open the app and type this code:', centreX, codeY, { align: 'center' });

  pdf.setFont('courier', 'bold');
  pdf.setFontSize(40);
  pdf.setTextColor(0, 0, 0);
  pdf.text(code, centreX, codeY + 18, { align: 'center' });

  // 5. Dispatch date.
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(13);
  pdf.setTextColor(60, 60, 60);
  pdf.text(`Going out: ${slip.dispatch_date_display || slip.dispatch_date || ''}`,
    centreX, PAGE_H - MARGIN, { align: 'center' });
};

// ── Public API ────────────────────────────────────────────────
// Both actions return a jsPDF instance rather than opening it, so the
// caller decides (and so this is testable without a browser window).
export const buildLabelPdf = (slips, { origin } = {}) => {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const usable = (slips || []).filter((s) => s && s.public_token);

  usable.forEach((slip, i) => {
    if (i > 0) pdf.addPage();
    drawLabel(pdf, slip, origin);
  });

  return { pdf, pageCount: usable.length, skipped: (slips || []).length - usable.length };
};

// Opens in the browser's own PDF viewer — no forced download. Matches
// usePdfDocument.openPdf, so printing a label behaves like printing a
// delivery note. The manager saves it themselves if they want to keep
// it; nothing is stored server-side.
export const openLabelPdf = (slips, { origin } = {}) => {
  const { pdf, pageCount, skipped } = buildLabelPdf(slips, { origin });
  if (pageCount === 0) return { opened: false, pageCount, skipped };

  const blobUrl = pdf.output('bloburl');
  const opened = window.open(blobUrl, '_blank');
  return { opened: Boolean(opened), pageCount, skipped };
};

export default { buildLabelPdf, openLabelPdf, shortCodeOf, slipUrlFor };
