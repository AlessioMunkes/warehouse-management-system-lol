#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# 20-staff-flow-rework.sh
#
# The warehouse worker flows: receiving and the dispatch gate.
#
# THE DIAGNOSIS
# Guided and Form were never really the problem. Both rendered inside
# the same <Dialog>, so whichever mode a worker picked, the work
# happened in a 560px box floating on a 1350px screen. Form then made
# them scroll, because every line was a ~135px card wrapping a single
# number. Guided avoided the scrolling by showing one line at a time
# and lost any sense of where you were in the job.
#
# WHAT CHANGES
#   A  The task is a page, not a dialog. Sticky head, scrolling body,
#      sticky footer. Browser back works, the tab bar stays reachable,
#      and a refresh no longer throws the job away.
#   B  Guided becomes focus mode over the SAME list rather than a
#      separate screen per line — the worker can always see the whole
#      job and can jump anywhere in it.
#   C  Exception-first: every line starts at the expected quantity and
#      "Everything as expected" fills the lot. The job becomes "tell
#      me what is different".
#   D  Dense rows, ~56px, with the number inline. Nine lines fit on
#      one screen instead of running to 1200px of scroll.
#   E  Two panes on a wide screen: the list on the left, the running
#      summary and the commit on the right. Collapses to one column
#      below 1024px, which is where the tablets are.
#   F  Per-line detail is an accordion. Put-away location, use-by date
#      and the variance notice only open on the line being worked.
#
# AND THE FOUR DEFECTS
#   1  PalletCheck showed "1.000" and "35.000" in the quantity boxes.
#      packed_quantity is Postgres NUMERIC, which node-postgres hands
#      over as the string "1.000"; String() kept it verbatim. It looked
#      broken and it put the caret after three meaningless zeros.
#   2  "Confirm collection" sat disabled with no way to find out why —
#      the driver's name and signature were below the fold. It now
#      says what is missing.
#   3  The gate queue said "Written off at 16:00" on every row at any
#      hour, with no date. Awaiting rows now carry a live cut-off, and
#      written-off rows say what collecting one now actually does.
#   4  No draft persistence. A tablet that slept mid-delivery lost the
#      job. Drafts are now kept per order and per pallet.
#
# Idempotent. Aborts without writing if the source has drifted.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

if [ ! -f client/src/features/procurement/components/ReceivingFlow.jsx ]; then
  echo "ERROR: run this from the repository root (the folder containing client/ and server/)." >&2
  exit 1
fi

python3 - <<'PYEOF'
import os, sys

CHANGES = 0
FAILED  = []

def _read(p):
    with open(p, 'rb') as f:
        b = f.read()
    return b.decode('utf-8').replace('\r\n', '\n'), (b'\r\n' in b)

def _write(p, s, crlf):
    with open(p, 'wb') as f:
        f.write((s.replace('\n', '\r\n') if crlf else s).encode('utf-8'))

def patch(path, old, new, label):
    global CHANGES
    if not os.path.exists(path):
        FAILED.append("%s: file not found (%s)" % (label, path)); return
    s, crlf = _read(path)
    if new in s:
        print("  = %s (already applied)" % label); return
    if old not in s:
        FAILED.append("%s: anchor not found in %s" % (label, path)); return
    n = s.count(old)
    if n != 1:
        FAILED.append("%s: anchor appears %d times in %s (expected 1)" % (label, n, path)); return
    _write(path, s.replace(old, new, 1), crlf)
    CHANGES += 1
    print("  + %s" % label)

def write_file(path, body, label):
    global CHANGES
    if os.path.exists(path):
        cur, _ = _read(path)
        if cur == body:
            print("  = %s (already written)" % label); return
    d = os.path.dirname(path)
    if d:
        os.makedirs(d, exist_ok=True)
    _write(path, body, False)
    CHANGES += 1
    print("  + %s" % label)

RECEIVING = 'client/src/features/procurement/components/ReceivingFlow.jsx'
PALLET    = 'client/src/features/dispatch/components/PalletCheck.jsx'
GATE      = 'client/src/features/dispatch/components/GateQueue.jsx'
CSS       = 'client/src/styles/staff.css'

# ══════════════════════════════════════════════════════════════
print("1  the task page (A, E)")
# ══════════════════════════════════════════════════════════════

write_file('client/src/features/staff/components/TaskPage.jsx', """// ───────────────────────────────────────────────────────────
// client/src/features/staff/components/TaskPage.jsx
//
// A whole-screen task: sticky head, scrolling body, sticky commit bar.
//
// This replaces the <Dialog> both staff flows used to render into. A
// dialog was the wrong container for the primary work of a screen:
//   - on a laptop it is a 560px box on a 1350px display, so the work
//     scrolls inside a small window surrounded by empty background
//   - on a phone it fights the fixed tab bar for the bottom of the
//     screen, which is where the commit button wants to be
//   - Escape and the backdrop dismiss it, which for a half-counted
//     delivery is a data-loss gesture with no confirmation
//   - the browser back button does not close it, and a refresh loses
//     it entirely
//
// `side` is the second pane. Above 1024px it sits to the right of the
// body as a sticky column — the running summary and the thing you
// press when you are done. Below that it drops beneath the body in
// normal flow, because a tablet at a loading bay has one column.
// ───────────────────────────────────────────────────────────
import { useEffect, useRef } from 'react';

export default function TaskPage({ title, sub, children, side, actions, note }) {
  const headingRef = useRef(null);

  // Same reason StepScreen does it: the heading changes when the task
  // does, and without moving focus a screen-reader user stays parked
  // on a control that no longer exists.
  useEffect(() => {
    headingRef.current?.focus();
  }, [title]);

  return (
    <section className="stf-task">
      <header className="stf-task-head">
        <h1 className="stf-task-title" ref={headingRef} tabIndex={-1}>{title}</h1>
        {sub ? <p className="stf-task-sub">{sub}</p> : null}
      </header>

      <div className="stf-task-cols">
        <div className="stf-task-main">{children}</div>
        {side ? <aside className="stf-task-side">{side}</aside> : null}
      </div>

      {actions || note ? (
        <footer className="stf-task-foot">
          {/* The reason above the button, not hidden in a tooltip. A
              disabled primary with no explanation is a dead end, and
              on this screen the missing thing is usually a field the
              worker has scrolled past. */}
          {note ? <p className="stf-task-note" role="status">{note}</p> : null}
          {actions}
        </footer>
      ) : null}
    </section>
  );
}
""", "TaskPage.jsx")

# ══════════════════════════════════════════════════════════════
print("2  the work list (B, C, D, F)")
# ══════════════════════════════════════════════════════════════

write_file('client/src/features/staff/components/WorkList.jsx', """// ───────────────────────────────────────────────────────────
// client/src/features/staff/components/WorkList.jsx
//
// The list of lines a worker is counting, in one shape for both modes.
//
// WHY ONE LIST AND NOT TWO SCREENS
// Guided used to be a separate render tree — a StepScreen per line.
// That is what made it feel restrictive: one line at a time, with no
// way to see the rest of the job or jump to the line you actually
// wanted. Here Guided is a FOCUS state over the same list. The focused
// row expands, the others stay visible and tappable, and Next simply
// moves the focus down. Nothing is hidden, and there is one code path
// instead of two that drift.
//
// WHY THE ROWS ARE THIS SMALL
// A row is the product, its expected quantity, and one number. As a
// card with a heading, a code line, a field label and a full-width
// input that is about 135px, so nine lines ran to 1200px of scrolling
// for nine numbers. Collapsed here it is one line of about 56px, and
// the per-line extras (put-away location, use-by date, the variance
// notice) live in the accordion that opens under the focused row.
//
// WHY EVERY LINE STARTS FILLED
// Most deliveries match the order and most pallets go out as packed.
// Making someone retype all nine is the actual waste. Lines arrive
// pre-filled by the caller and `onAcceptAll` fills any that are still
// blank, so the job becomes "tell me what is different".
// ───────────────────────────────────────────────────────────

// A step of one. Fractional quantities are real here (35.5 kg), so the
// steppers move by whole units and the field itself still takes any
// decimal the worker types.
const bump = (value, by) => {
  const next = Number(value === '' ? 0 : value) + by;
  return String(next < 0 ? 0 : Math.round(next * 1000) / 1000);
};

export function WorkRow({
  line, focused, onFocus, onChange, detail, expectedLabel = 'Expected',
}) {
  const filled  = line.value !== '' && line.value !== null && line.value !== undefined;
  const varies  = filled && Number(line.value) !== Number(line.expected);

  return (
    <div className={`stf-wl-row${varies ? ' is-warn' : ''}${focused ? ' is-focus' : ''}`}>
      <div className="stf-wl-line">
        <button
          type="button"
          className="stf-wl-main"
          aria-expanded={focused}
          onClick={() => onFocus?.(line.id)}
        >
          {varies ? <span className="stf-wl-mark" aria-hidden="true">!</span> : null}
          <span className="stf-wl-text">
            <span className="stf-wl-title">{line.title}</span>
            <span className="stf-wl-meta">
              {line.sku ? `${line.sku} \\u00b7 ` : ''}{expectedLabel} {line.expected}{line.unit ? ` ${line.unit}` : ''}
            </span>
          </span>
        </button>

        {/* Steppers either side of the number, because the alternative
            on a phone held with gloves is a keyboard covering half the
            screen for a change of one. The field stays a text input
            with inputMode="decimal" for the same reason NumberField
            does: type="number" spinners are unusable on a tablet. */}
        <div className="stf-wl-qty">
          <button
            type="button"
            className="stf-wl-step"
            aria-label={`One fewer ${line.title}`}
            onClick={() => onChange?.(line.id, bump(line.value, -1))}
          >
            &minus;
          </button>
          <input
            className={`stf-wl-input${varies ? ' is-flagged' : ''}`}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            aria-label={`${line.title}, quantity`}
            value={line.value ?? ''}
            onFocus={() => onFocus?.(line.id)}
            onChange={(e) => onChange?.(line.id, e.target.value.replace(',', '.'))}
          />
          <button
            type="button"
            className="stf-wl-step"
            aria-label={`One more ${line.title}`}
            onClick={() => onChange?.(line.id, bump(line.value, 1))}
          >
            +
          </button>
        </div>
      </div>

      {focused && detail ? <div className="stf-wl-detail">{detail}</div> : null}
    </div>
  );
}

export default function WorkList({
  lines, focusId, onFocus, onChange, renderDetail,
  expectedLabel = 'Expected', onAcceptAll, acceptAllLabel = 'Everything as expected',
}) {
  const total  = lines.length;
  const done   = lines.filter((l) => l.value !== '' && l.value !== null && l.value !== undefined).length;
  const varied = lines.filter(
    (l) => l.value !== '' && l.value !== null && Number(l.value) !== Number(l.expected)
  ).length;

  return (
    <div className="stf-wl">
      <div className="stf-wl-bar">
        <span className="stf-wl-count" aria-live="polite">
          {done} of {total} checked{varied ? ` \\u00b7 ${varied} different` : ''}
        </span>
        {onAcceptAll && done < total ? (
          <button type="button" className="stf-wl-accept" onClick={onAcceptAll}>
            {acceptAllLabel}
          </button>
        ) : null}
      </div>

      <div className="stf-wl-rows">
        {lines.map((line) => (
          <WorkRow
            key={line.id}
            line={line}
            focused={String(focusId) === String(line.id)}
            onFocus={onFocus}
            onChange={onChange}
            expectedLabel={expectedLabel}
            detail={renderDetail ? renderDetail(line) : null}
          />
        ))}
      </div>
    </div>
  );
}
""", "WorkList.jsx")

# ══════════════════════════════════════════════════════════════
print("3  draft persistence (fix 4)")
# ══════════════════════════════════════════════════════════════

write_file('client/src/features/staff/hooks/useDraft.js', """// ───────────────────────────────────────────────────────────
// client/src/features/staff/hooks/useDraft.js
//
// Keeps an in-progress job on the device so a tablet that sleeps, a
// dropped connection or a stray back-swipe does not throw away a
// half-counted delivery.
//
// Scoped by key — one draft per purchase order, one per pallet — so
// two jobs never overwrite each other and finishing one does not
// clear another.
//
// localStorage, not IndexedDB: this is a few kilobytes of form state
// belonging to one worker on one device, it must survive a reload
// rather than a reinstall, and every read and write is wrapped because
// a private window throws on access rather than returning null.
//
// This is NOT the offline write queue. Nothing here is ever sent to
// the server on its own; it only refills the form. The queue is a
// bigger piece of work and is still open.
// ───────────────────────────────────────────────────────────

const PREFIX = 'stf_draft_';

// A draft older than this is stale enough that refilling a form with
// it would be a surprise rather than a convenience. A shift is eight
// hours; a day covers someone coming back after lunch and not someone
// coming back next week to last week's delivery.
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const readDraft = (key) => {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.savedAt || Date.now() - parsed.savedAt > MAX_AGE_MS) {
      localStorage.removeItem(PREFIX + key);
      return null;
    }
    return parsed.data ?? null;
  } catch {
    return null;
  }
};

export const writeDraft = (key, data) => {
  if (!key) return;
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ savedAt: Date.now(), data }));
  } catch {
    // A full or blocked store is not a reason to interrupt someone
    // counting stock. The draft is a convenience; the form still works.
  }
};

export const clearDraft = (key) => {
  if (!key) return;
  try {
    localStorage.removeItem(PREFIX + key);
  } catch { /* see writeDraft */ }
};

export default { readDraft, writeDraft, clearDraft };
""", "useDraft.js")

# ══════════════════════════════════════════════════════════════
print("4  styles")
# ══════════════════════════════════════════════════════════════

CSS_BLOCK = """

/* ── Task page (TaskPage.jsx) ──────────────────────────────────
   The container that replaced the dialog both staff flows used to
   render into. Full width of the shell rather than a 560px box, with
   the head and the commit bar pinned so neither scrolls away from a
   worker halfway down a nine-line delivery. */
.stf-task {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-height: 0;
}
.stf-task-head {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--stf-sand);
  padding: 16px 0 12px;
  border-bottom: 1px solid var(--stf-border);
}
.stf-task-title {
  font-family: var(--stf-font-display);
  font-size: 22px;
  font-weight: 700;
  color: var(--stf-ink);
  margin: 0;
}
.stf-task-title:focus-visible { outline: 2px solid var(--stf-accent); outline-offset: 3px; }
.stf-task-sub { margin: 4px 0 0; font-size: 14px; color: var(--stf-text-sub); }

.stf-task-cols { display: block; padding: 12px 0 16px; }
.stf-task-main { min-width: 0; }
.stf-task-side { margin-top: 16px; }

/* Two panes only where there is width for two panes. Below this the
   device is a phone or a bench tablet and the side pane is simply the
   next thing down the page. */
@media (min-width: 1024px) {
  .stf-task-cols {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: 24px;
    align-items: start;
  }
  .stf-task-side {
    margin-top: 0;
    position: sticky;
    top: 92px;
  }
}

.stf-task-foot {
  position: sticky;
  bottom: 0;
  z-index: 2;
  background: var(--stf-sand);
  border-top: 1px solid var(--stf-border);
  padding: 12px 0 calc(12px + env(safe-area-inset-bottom));
}
.stf-task-note {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--stf-attention-ink);
}

/* On a wide screen the commit lives in the side pane, so the sticky
   footer would be a second copy of it taking up the bottom of the
   page for nothing. */
@media (min-width: 1024px) {
  .stf-task-foot.is-side-commit { display: none; }
}

/* ── Work list (WorkList.jsx) ──────────────────────────────────
   One row per line: what it is on the left, the number on the right,
   about 56px tall. The card-per-line shape this replaced was ~135px,
   which is what made nine lines a scroll instead of a screen. */
.stf-wl { display: flex; flex-direction: column; gap: 8px; }

.stf-wl-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.stf-wl-count { font-size: 13px; color: var(--stf-text-sub); }
.stf-wl-accept {
  min-height: var(--stf-tap);
  padding: 0 16px;
  border: 1px solid var(--stf-ink);
  border-radius: var(--stf-radius-pill);
  background: var(--stf-white);
  font-family: var(--stf-font-sans);
  font-size: 14px;
  font-weight: 600;
  color: var(--stf-ink);
  cursor: pointer;
}
.stf-wl-accept:hover { background: var(--stf-ink); color: var(--stf-white); }

.stf-wl-rows {
  border: 1px solid var(--stf-border);
  border-radius: var(--stf-radius);
  background: var(--stf-white);
  overflow: hidden;
}
.stf-wl-row { border-bottom: 1px solid var(--stf-border); }
.stf-wl-row:last-child { border-bottom: 0; }
.stf-wl-row.is-warn { background: var(--stf-attention-bg); }
/* The focused row in Guided. A left bar rather than a colour swap,
   so it never collides with the warn state a varied line already
   carries — ACC-03, never colour alone. */
.stf-wl-row.is-focus { box-shadow: inset 3px 0 0 var(--stf-accent); }

.stf-wl-line {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 56px;
  padding: 6px 10px;
}
.stf-wl-main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 0;
  background: none;
  text-align: left;
  cursor: pointer;
  padding: 4px 0;
  font-family: inherit;
}
.stf-wl-text { min-width: 0; display: flex; flex-direction: column; }
.stf-wl-title {
  font-family: var(--stf-font-display);
  font-size: 15px;
  font-weight: 600;
  color: var(--stf-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.stf-wl-meta {
  font-size: 12px;
  color: var(--stf-text-meta);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.stf-wl-mark {
  flex: 0 0 auto;
  width: 20px; height: 20px;
  border-radius: 50%;
  background: var(--stf-attention);
  color: var(--stf-white);
  font-size: 13px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.stf-wl-qty { flex: 0 0 auto; display: flex; align-items: center; gap: 4px; }
.stf-wl-step {
  width: var(--stf-tap);
  height: var(--stf-tap);
  border: 1px solid var(--stf-border);
  border-radius: var(--stf-radius-sm);
  background: var(--stf-white);
  font-size: 20px;
  line-height: 1;
  color: var(--stf-ink);
  cursor: pointer;
}
.stf-wl-step:hover { background: var(--stf-sand); }
.stf-wl-input {
  width: 84px;
  min-height: var(--stf-tap);
  border: 1px solid var(--stf-border);
  border-radius: var(--stf-radius-sm);
  background: var(--stf-white);
  text-align: center;
  font-family: var(--stf-font-display);
  font-size: 18px;
  font-weight: 700;
  color: var(--stf-ink);
}
.stf-wl-input.is-flagged { border-color: var(--stf-attention); }

/* The accordion. Only the focused line opens, so put-away location,
   use-by date and the variance notice are present when they matter
   and invisible when they do not. */
.stf-wl-detail {
  padding: 4px 10px 14px;
  border-top: 1px dashed var(--stf-border);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ── Summary card, for the side pane ──────────────────────── */
.stf-summary {
  border: 1px solid var(--stf-border);
  border-radius: var(--stf-radius);
  background: var(--stf-white);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.stf-summary-title {
  font-family: var(--stf-font-display);
  font-size: 14px;
  font-weight: 700;
  color: var(--stf-ink);
  margin: 0;
}
"""

css, css_crlf = _read(CSS)
if '.stf-task-head' in css:
    print("  = staff.css: task page and work list styles (already applied)")
else:
    _write(CSS, css.rstrip('\n') + '\n' + CSS_BLOCK, css_crlf)
    CHANGES += 1
    print("  + staff.css: task page and work list styles")

# ══════════════════════════════════════════════════════════════
print("5  dispatch gate flow (A, B, C, D, E, F + fixes 1, 2, 4)")
# ══════════════════════════════════════════════════════════════

# A rewrite, not a patch: the render tree changes shape (two
# screens instead of three plus a duplicate Form tree) and every
# eligibility gate, override path, variance reason and the
# idempotency key are carried across unchanged.
write_file(PALLET, """// ─────────────────────────────────────────────────────────────
// client/src/features/dispatch/components/PalletCheck.jsx
//
// One pallet at the gate.
//
// SHAPE (changed)
// This used to be three sequential screens inside a dialog, with a
// second, near-duplicate render tree for Form mode. It is now two
// screens on the page itself:
//
//   1  Which pallet   the beneficiary, the eligibility flags, and a
//                     manager's override reason where one is needed
//   2  Load and release   every line at once, the driver, the signature
//
// Guided and Form are no longer different trees. They are the same
// list; Guided focuses one row at a time and offers Next, Form leaves
// every row collapsed and inline-editable. The worker can see the
// whole pallet either way, and can tap any line to jump to it — which
// is what "Guided" was previously unable to offer.
//
// The one HARD block is an inactive beneficiary centre (BR-11) —
// nothing here gets past that, for anyone. A pallet packing has not
// closed off needs a manager's typed reason; a warehouse worker is
// told to find one. This screen is not the source of truth for any of
// that — evaluateEligibility() on the server is — but disagreeing
// with it here would mean filling in a whole form only to be refused
// at the last tap.
//
// wrongDay is deliberately NOT an override condition, matching
// dispatch.service.js's collect(): a pallet booked for another day is
// recorded rather than gated, same as a written-off one.
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react';
import {
  StepRail, StepScreen, Actions, Button, TextField, Notice, KeyValues,
  ViewToggle, Coachmark,
} from '../../staff/components/StepPrimitives';
import TaskPage from '../../staff/components/TaskPage';
import WorkList from '../../staff/components/WorkList';
import { readDraft, writeDraft, clearDraft } from '../../staff/hooks/useDraft';
import useCoachmark from '../../staff/hooks/useCoachmark';
import { useAuth } from '../../../context/AuthContext';
import dispatchAPI, { newIdempotencyKey } from '../../../services/dispatchAPI';
import SignaturePad from '../../procurement/components/SignaturePad';
import DispatchNotePDF from './DispatchNotePDF';

const isManager = (user) => user?.role === 'manager' || user?.role === 'admin';

// Postgres NUMERIC arrives from node-postgres as a string, so
// packed_quantity is "1.000" and "35.000". String() kept that
// verbatim, which put "1.000" in the box for one crate and left the
// caret behind three meaningless zeros. Number() first.
const qtyToInput = (value) => (value === null || value === undefined ? '' : String(Number(value)));

const SignatureField = ({ value, onChange }) => (
  <div className="stf-signature-field">
    <span className="stf-field-label">Driver&rsquo;s signature</span>
    <SignaturePad
      onChange={onChange}
      canvasClassName="stf-sign-canvas"
      clearButtonClassName="stf-signature-clear"
    />
    {!value ? (
      <p className="stf-field-hint">Ask the driver to sign above before you finish.</p>
    ) : null}
  </div>
);

const MODE_KEY = 'stf_dispatch_view_mode';
const MODES = [
  { value: 'guided', label: 'Guided', hint: 'One line at a time' },
  { value: 'full',   label: 'Form',   hint: 'Every line at once' },
];
const readStoredMode = () => {
  try {
    return localStorage.getItem(MODE_KEY) === 'full' ? 'full' : 'guided';
  } catch {
    return 'guided';
  }
};

const TOTAL_STEPS = 2;
const STEP_META = {
  which: { n: 1, label: 'Which pallet' },
  work:  { n: 2, label: 'Load and release' },
  done:  { n: 2, label: 'Collected' },
};

// The reasons this screen can put on a line without asking a worker to
// type free text (ACC-09: no field a floor worker has to compose a
// sentence into).
const varianceReasonFor = (variance) =>
  variance === 0 ? null : variance < 0 ? 'Short count at dispatch' : 'Over count at dispatch';

export default function PalletCheck({ palletId, onBack, onCollected }) {
  const { user } = useAuth();

  const [gateView, setGateView] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [phase, setPhase] = useState('which');
  const [lines, setLines] = useState([]);
  const [focusId, setFocusId] = useState(null);

  const [overrideReason, setOverrideReason] = useState('');
  const [driverName, setDriverName] = useState('');
  const [vehicleReg, setVehicleReg] = useState('');
  const [signature, setSignature] = useState(null);

  const [mode, setMode] = useState(readStoredMode);
  const { show: showCoachmark, dismiss: dismissCoachmark } = useCoachmark('dispatch-view-toggle');

  const [attemptKey, setAttemptKey] = useState(newIdempotencyKey);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [pdfNote, setPdfNote] = useState(null);

  const draftKey = palletId ? `dispatch-${palletId}` : null;

  // A fresh pallet is a fresh session — DispatchPage keeps this
  // component mounted across pallets (only `palletId` changes), so
  // none of the previous pallet's state, or its idempotency key, may
  // survive into this one.
  useEffect(() => {
    let cancelled = false;
    // Wrapped rather than called directly at the top of the effect —
    // react-hooks/set-state-in-effect flags a bare synchronous
    // setState in an effect body.
    const resetForNewPallet = () => {
      setLoading(true);
      setLoadError(null);
      setPhase('which');
      setFocusId(null);
      setOverrideReason('');
      setDriverName('');
      setVehicleReg('');
      setSignature(null);
      setPdfNote(null);
      setError(null);
      setAttemptKey(newIdempotencyKey());
    };
    resetForNewPallet();

    dispatchAPI.getGateView(palletId)
      .then((view) => {
        if (cancelled) return;
        setGateView(view);

        // Exception-first: a pallet normally goes out exactly as it
        // was packed, so every line starts at the packed quantity and
        // the worker's job is to say what is different.
        const built = (view.items || []).map((item) => ({
          itemId:   item.id,
          name:     item.product_name,
          sku:      item.sku,
          unit:     item.unit,
          required: Number(item.required_quantity ?? 0),
          packed:   item.packed_quantity === null ? null : Number(item.packed_quantity),
          loaded:   qtyToInput(item.packed_quantity),
        }));

        // A draft only refills the numbers and the driver's details —
        // never the eligibility state, which is the server's to decide
        // and may have changed since the tablet went to sleep.
        const draft = readDraft(`dispatch-${palletId}`);
        if (draft) {
          setLines(built.map((l) => (
            draft.loaded && draft.loaded[l.itemId] !== undefined
              ? { ...l, loaded: draft.loaded[l.itemId] }
              : l
          )));
          if (draft.driverName) setDriverName(draft.driverName);
          if (draft.vehicleReg) setVehicleReg(draft.vehicleReg);
        } else {
          setLines(built);
        }
      })
      .catch((err) => { if (!cancelled) setLoadError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [palletId]);

  const step = STEP_META[phase];
  const showToggle = phase === 'work';
  const eligibility = gateView?.eligibility || {};

  // Only lines that were actually packed can be loaded — the same
  // filter dispatch.repository.js's collect() applies server-side.
  const packedLines = useMemo(
    () => lines.filter((l) => l.packed !== null && l.packed > 0),
    [lines]
  );
  const hasLines = packedLines.length > 0;

  const needsOverride = eligibility.slipNotPacked;
  const overrideReasonText = eligibility.slipNotPacked
    ? 'packing has not closed this pallet off yet'
    : '';
  const canStart = !eligibility.ecdInactive && (!needsOverride || (isManager(user) && overrideReason.trim()));

  // Save the draft whenever the numbers or the driver change. Guarded
  // on phase so an untouched pallet does not leave a draft behind.
  useEffect(() => {
    if (phase !== 'work' || !draftKey) return;
    const loaded = {};
    for (const line of packedLines) loaded[line.itemId] = line.loaded;
    writeDraft(draftKey, { loaded, driverName, vehicleReg });
  }, [phase, draftKey, packedLines, driverName, vehicleReg]);

  const handleModeChange = (next) => {
    setMode(next);
    // Guided focuses the first line that still needs a look; Form has
    // no focused row at all.
    setFocusId(next === 'guided' ? (packedLines[0]?.itemId ?? null) : null);
    try { localStorage.setItem(MODE_KEY, next); } catch { /* nothing we can do */ }
    dismissCoachmark();
  };

  useEffect(() => {
    if (!showCoachmark || !showToggle) return undefined;
    const timer = setTimeout(dismissCoachmark, 5000);
    return () => clearTimeout(timer);
  }, [showCoachmark, showToggle, dismissCoachmark]);

  const startCollection = () => {
    setPhase('work');
    setFocusId(mode === 'guided' ? (packedLines[0]?.itemId ?? null) : null);
  };

  const patchLine = (itemId, patch) =>
    setLines((all) => all.map((line) => (line.itemId === itemId ? { ...line, ...patch } : line)));

  const acceptAllAsPacked = () =>
    setLines((all) => all.map((line) => (
      line.loaded === '' ? { ...line, loaded: qtyToInput(line.packed) } : line
    )));

  const focusIndex = packedLines.findIndex((l) => l.itemId === focusId);
  const goToNextLine = () => {
    const next = packedLines[focusIndex + 1];
    setFocusId(next ? next.itemId : null);
  };

  // What is stopping the commit, said out loud. A disabled primary
  // with no explanation is a dead end, and here the missing thing is
  // usually a field further down the page.
  const blockers = [];
  if (!driverName.trim()) blockers.push("the driver's name");
  if (!signature) blockers.push("the driver's signature");
  if (packedLines.some((l) => l.loaded === '')) blockers.push('a count on every line');
  const blockedNote = blockers.length
    ? `Still needed: ${blockers.join(', ')}.`
    : null;

  const finish = async () => {
    setSaving(true);
    setError(null);
    try {
      const overrides = packedLines
        .filter((line) => Number(line.loaded || 0) !== line.packed)
        .map((line) => ({
          itemId:         line.itemId,
          loadedQuantity: Number(line.loaded || 0),
          varianceReason: varianceReasonFor(Number(line.loaded || 0) - line.packed),
        }));

      const result = await dispatchAPI.recordCollection(palletId, {
        driverName,
        vehicleReg,
        signature,
        lines: overrides,
        idempotencyKey: attemptKey,
        overrideReason: needsOverride ? overrideReason : null,
      });

      setPhase('done');
      clearDraft(draftKey);
      // recordCollection's response already carries the full joined
      // note — no second fetch needed for the pop-up.
      setPdfNote(result.note);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const backToQueue = () => {
    setPdfNote(null);
    onCollected?.();
  };

  if (loading) return <div className="stf-skeleton" aria-label="Loading" />;
  if (loadError) return <Notice tone="warn">{loadError}</Notice>;
  if (!gateView) return null;

  const commit = (
    <Actions>
      <Button disabled={saving || blockers.length > 0} onClick={finish}>
        {saving ? 'Saving' : 'Confirm collection'}
      </Button>
      {mode === 'guided' && focusIndex >= 0 && focusIndex + 1 < packedLines.length ? (
        <Button variant="secondary" onClick={goToNextLine}>Next item</Button>
      ) : null}
      <Button variant="secondary" onClick={onBack}>Back to the gate queue</Button>
    </Actions>
  );

  return (
    <>
      {showToggle ? (
        <div className="stf-toggle-anchor">
          <ViewToggle options={MODES} value={mode} onChange={handleModeChange} />
          <Coachmark show={showCoachmark} onDismiss={dismissCoachmark}>
            Tap here to switch view
          </Coachmark>
        </div>
      ) : null}

      {phase !== 'done' ? <StepRail step={step.n} total={TOTAL_STEPS} label={step.label} /> : null}

      {error ? <Notice tone="warn">{error}</Notice> : null}

      {/* ── 1 · Which pallet ───────────────────────────────── */}
      {phase === 'which' && (
        <StepScreen
          title={gateView.ecd_name}
          sub={gateView.pallet_ref ? `Pallet ${gateView.pallet_ref}` : 'Check the pallet before you release it.'}
          actions={
            <Actions>
              <Button disabled={!canStart} onClick={startCollection}>Start the collection</Button>
              <Button variant="secondary" onClick={onBack}>Back to the gate queue</Button>
            </Actions>
          }
        >
          <KeyValues
            pairs={[
              ['Cohort', gateView.cohort],
              ['Items', `${packedLines.length}`],
            ]}
          />

          {eligibility.ecdInactive ? (
            <Notice tone="warn">
              {gateView.ecd_name} is not an active centre with approved quantities, so this pallet
              cannot be released. Ask a manager to activate the centre first.
            </Notice>
          ) : null}

          {!eligibility.ecdInactive && needsOverride ? (
            isManager(user) ? (
              <div className="stf-field">
                <label className="stf-field-label" htmlFor="stf-override-reason">
                  Reason for authorising this collection
                </label>
                <textarea
                  id="stf-override-reason"
                  className="stf-input is-text"
                  rows={2}
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder={`${overrideReasonText}. Say why this can still go out today.`}
                />
              </div>
            ) : (
              <Notice tone="warn">
                {overrideReasonText}. Ask a manager to authorise this collection at the gate.
              </Notice>
            )
          ) : null}

          {eligibility.hasFlaggedLines ? (
            <Notice tone="warn">Packing flagged one or more lines on this pallet. Check them below.</Notice>
          ) : null}
          {eligibility.hasVariance ? (
            <Notice tone="warn">What was packed doesn&rsquo;t match the order on one or more lines.</Notice>
          ) : null}
          {eligibility.writtenOff ? (
            <Notice>
              This pallet was written off as not collected. It is still here — collecting it now
              records a late collection, nothing else changes.
            </Notice>
          ) : null}
          {eligibility.wrongDay ? (
            <Notice>
              {gateView.ecd_name} is booked for another day. Collecting it now still goes through —
              it&rsquo;s recorded as an off-schedule collection for your manager to see.
            </Notice>
          ) : null}
        </StepScreen>
      )}

      {/* ── 2 · Load and release ───────────────────────────── */}
      {phase === 'work' && (
        <TaskPage
          title={gateView.ecd_name}
          sub="Check every line, then take the driver's name and signature."
          note={blockedNote}
          actions={commit}
          side={
            <div className="stf-summary">
              <p className="stf-summary-title">Driver</p>
              <TextField
                id="stf-driver-name"
                label="Driver's name"
                value={driverName}
                onChange={setDriverName}
              />
              <TextField
                id="stf-vehicle-reg"
                label="Vehicle registration (optional)"
                value={vehicleReg}
                onChange={setVehicleReg}
              />
              <SignatureField value={signature} onChange={setSignature} />
            </div>
          }
        >
          {needsOverride && isManager(user) ? (
            <div className="stf-field">
              <label className="stf-field-label" htmlFor="stf-work-override-reason">
                Reason for authorising this collection
              </label>
              <textarea
                id="stf-work-override-reason"
                className="stf-input is-text"
                rows={2}
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder={`${overrideReasonText}. Say why this can still go out today.`}
              />
            </div>
          ) : null}

          {hasLines ? (
            <WorkList
              lines={packedLines.map((line) => ({
                id:       line.itemId,
                title:    line.name,
                sku:      line.sku,
                unit:     line.unit,
                expected: line.packed,
                value:    line.loaded,
              }))}
              expectedLabel="packed"
              focusId={mode === 'guided' ? focusId : null}
              onFocus={(id) => setFocusId(mode === 'guided' ? id : null)}
              onChange={(id, value) => patchLine(id, { loaded: value })}
              onAcceptAll={acceptAllAsPacked}
              acceptAllLabel="Everything as packed"
              renderDetail={(row) => {
                const line = packedLines.find((l) => l.itemId === row.id);
                if (!line) return null;
                const varied = line.loaded !== '' && Number(line.loaded) !== line.packed;
                return (
                  <>
                    <KeyValues
                      pairs={[
                        ['Code', line.sku],
                        ['Packed', `${line.packed} ${line.unit}`],
                        ['Ordered', `${line.required} ${line.unit}`],
                      ]}
                    />
                    {varied ? (
                      <Notice tone="warn">
                        That&rsquo;s different from what packing recorded. Saving still records the
                        collection — a manager will see the difference.
                      </Notice>
                    ) : null}
                  </>
                );
              }}
            />
          ) : (
            <Notice>Nothing on this pallet was packed, so there is nothing to load.</Notice>
          )}
        </TaskPage>
      )}

      {/* ── Done ───────────────────────────────────────────── */}
      {phase === 'done' && (
        <StepScreen
          title="Collection confirmed"
          sub="The stock is off the system and the pallet is on its way."
          actions={
            <Actions>
              <Button onClick={backToQueue}>Back to the gate queue</Button>
            </Actions>
          }
        />
      )}

      {pdfNote ? (
        <DispatchNotePDF note={pdfNote} onClose={() => setPdfNote(null)} />
      ) : null}
    </>
  );
}
""", "PalletCheck.jsx: page, focus mode, dense rows, accept-all, draft")

# ══════════════════════════════════════════════════════════════
print("6  receiving flow (A, B, C, D, E, F + fix 4)")
# ══════════════════════════════════════════════════════════════

# A rewrite for the same reason as PalletCheck: the render tree
# changes shape. The submit payload, the fresh-product test, the
# SAST-safe todayISO and the once-per-pass idempotency key are
# carried across byte for byte.
write_file(RECEIVING, """// ─────────────────────────────────────────────────────────────
// client/src/features/procurement/components/ReceivingFlow.jsx
//
// Booking a delivery in at the bay.
//
// SHAPE (changed)
// This used to be four sequential screens for Guided plus a second,
// near-duplicate render tree that put the same fields into one
// scrolling dialog for Form. It is now two screens on the page:
//
//   1  Which delivery   supplier, order, date
//   2  Count and put away   every line at once, then the signature
//
// Guided and Form are the same list now, not two trees. Guided
// focuses one row and offers Next; Form leaves every row collapsed
// and inline-editable. Either way the whole delivery is on screen, so
// a worker can see how much is left and jump straight to the line
// they are standing in front of.
//
// EXCEPTION-FIRST
// Lines arrive pre-filled with the ordered quantity and there is an
// "Everything as ordered" button. Most deliveries match the note;
// retyping nine numbers that were already right was the actual waste.
// Anything that differs still raises the same notice and still sends
// the same structural discrepancy reason.
//
// The idempotency key is generated ONCE per pass and regenerated only
// by restart(). A tablet at the bay loses signal often and finish()
// gets retried by the person tapping again — which used to create a
// second delivery note and put the stock up twice. A key generated
// inside finish() would be new on every tap and would protect nothing.
//
// There is no "save and finish later": nothing in this app persists a
// delivery that has not been submitted. What IS kept is a local draft
// of the numbers, so a tablet that sleeps does not lose the count —
// see hooks/useDraft.js. That refills the form; it never submits.
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react';
import {
  StepRail, StepScreen, Actions, Button, SelectField, DateField,
  ChoiceList, Notice, KeyValues, ViewToggle, Coachmark,
} from '../../staff/components/StepPrimitives';
import TaskPage from '../../staff/components/TaskPage';
import WorkList from '../../staff/components/WorkList';
import { readDraft, writeDraft, clearDraft } from '../../staff/hooks/useDraft';
import useCoachmark from '../../staff/hooks/useCoachmark';
import receivingAPI from '../../../services/receivingAPI';
import { newIdempotencyKey } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import SignaturePad from './SignaturePad';
import DeliveryNotePDF from './DeliveryNotePDF';

// Shared by both modes, right before the submit button. SignaturePad
// is the manager side's own component — canvasClassName /
// clearButtonClassName are what let it look native here instead of
// carrying the manager page's plain-link styling.
const SignatureField = ({ value, onChange }) => (
  <div className="stf-signature-field">
    <span className="stf-field-label">Driver&rsquo;s signature</span>
    <SignaturePad
      onChange={onChange}
      canvasClassName="stf-sign-canvas"
      clearButtonClassName="stf-signature-clear"
    />
    {!value ? (
      <p className="stf-field-hint">Ask the driver to sign above before you finish.</p>
    ) : null}
  </div>
);

const MODE_KEY = 'stf_receiving_view_mode';
const MODES = [
  { value: 'guided', label: 'Guided', hint: 'One line at a time' },
  { value: 'full',   label: 'Form',   hint: 'Every line at once' },
];
const readStoredMode = () => {
  try {
    return localStorage.getItem(MODE_KEY) === 'full' ? 'full' : 'guided';
  } catch {
    return 'guided';
  }
};

const TOTAL_STEPS = 2;
const STEP_META = {
  which: { n: 1, label: 'Which delivery' },
  work:  { n: 2, label: 'Count and put away' },
  done:  { n: 2, label: 'Finished' },
};

// Where a line can go. Two options, because two is how many places the
// warehouse has (warehouse visit: cold room and dry store).
const LOCATIONS = [
  { value: 'dry_store', label: 'Dry store', meta: 'Shelves at the back' },
  { value: 'cold_room', label: 'Cold room', meta: 'For fresh food only' },
];

// Fresh lines need a use-by date and are picked date-first; dry goods
// are picked oldest-first and have no date to record (BR-06). Reads
// products.is_perishable; the name heuristic stays only as a fallback
// for a database without that column, so a missing column degrades
// this to a guess rather than breaking the screen.
const FRESH_HINTS = [
  'spinach', 'butternut', 'cabbage', 'carrot', 'tomato', 'onion',
  'apple', 'banana', 'potato', 'lettuce', 'fresh', 'milk',
];
const isFreshProduct = (item) =>
  typeof item.is_perishable === 'boolean'
    ? item.is_perishable
    : FRESH_HINTS.some((hint) => (item.product_name || '').toLowerCase().includes(hint));

// NOT toISOString().slice(0, 10). That formats in UTC and Cape Town is
// UTC+2, so between midnight and 02:00 SAST it returns YESTERDAY and
// the note is dated to the wrong day.
const todayISO = () => {
  const d   = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const longDate = (value) =>
  new Date(value).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long' });

export default function ReceivingFlow({ onCrumbChange }) {
  const { user } = useAuth();
  const [phase, setPhase] = useState('which');
  const [mode, setMode] = useState(readStoredMode);
  const [focusId, setFocusId] = useState(null);
  const { show: showCoachmark, dismiss: dismissCoachmark } = useCoachmark('receiving-view-toggle');

  const [suppliers, setSuppliers] = useState([]);
  // Narrower than `suppliers` — only those with an approved order.
  const [openSuppliers, setOpenSuppliers] = useState([]);
  const [deliveryDate, setDeliveryDate] = useState(todayISO);
  const [signature, setSignature] = useState(null);
  const [pdfDelivery, setPdfDelivery] = useState(null);

  // What the last fetch returned, keyed implicitly by supplierId. The
  // list only means anything while a supplier is selected, so the
  // "no supplier, no orders" case is derived rather than written back
  // into state from the effect — clearing state synchronously inside
  // an effect body triggers a cascading render.
  const [fetchedOrders, setFetchedOrders] = useState([]);
  const [supplierId, setSupplierId] = useState('');
  const [orderId, setOrderId] = useState('');

  const orders = supplierId ? fetchedOrders : [];

  // One entry per order line: what was expected, what was counted,
  // where it went, and the use-by date if it is fresh.
  const [lines, setLines] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [attemptKey, setAttemptKey] = useState(newIdempotencyKey);

  const step = STEP_META[phase];
  const draftKey = orderId ? `receiving-${orderId}` : null;

  // ── Suppliers, once ─────────────────────────────────────────
  // Both lists up front rather than lazily on first switch to Form:
  // mode is remembered per device and can already be 'full' on load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [list, openList] = await Promise.all([
          receivingAPI.getSuppliers(),
          receivingAPI.getSuppliersWithOpenOrders(),
        ]);
        if (!cancelled) { setSuppliers(list); setOpenSuppliers(openList); }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Supplier chosen, load its approved orders ───────────────
  useEffect(() => {
    if (!supplierId) return undefined;
    let cancelled = false;
    (async () => {
      setError(null);
      try {
        const list = await receivingAPI.getPurchaseOrders(supplierId);
        if (!cancelled) setFetchedOrders(list);
      } catch (err) {
        // A supplier with no approved order is a normal state that has
        // an explanation, not a failure.
        if (!cancelled) { setFetchedOrders([]); setError(err.message); }
      }
    })();
    return () => { cancelled = true; };
  }, [supplierId]);

  useEffect(() => { onCrumbChange?.(step.label); }, [step.label, onCrumbChange]);

  const supplierName = useMemo(
    () => suppliers.find((s) => String(s.id) === String(supplierId))?.name ?? 'this supplier',
    [suppliers, supplierId]
  );
  const shortLines = lines.filter((l) => l.counted !== '' && Number(l.counted) < l.expected);
  const receivedByName = user?.firstName ? `${user.firstName} ${user.lastName ?? ''}`.trim() : 'You';
  const hasLines = lines.length > 0;

  // Keep the count on the device. This refills the form after a sleep
  // or a reload; it never submits anything.
  useEffect(() => {
    if (phase !== 'work' || !draftKey || !hasLines) return;
    const counted = {};
    for (const line of lines) {
      counted[line.purchaseOrderItemId] = {
        counted: line.counted, location: line.location, useBy: line.useBy,
      };
    }
    writeDraft(draftKey, { counted, deliveryDate });
  }, [phase, draftKey, lines, deliveryDate, hasLines]);

  const handleModeChange = (next) => {
    setMode(next);
    setFocusId(next === 'guided' ? (lines[0]?.purchaseOrderItemId ?? null) : null);
    try { localStorage.setItem(MODE_KEY, next); } catch { /* nothing we can do */ }
    dismissCoachmark();
  };

  // A first-run nudge, not a fixture.
  useEffect(() => {
    if (!showCoachmark || phase === 'done') return undefined;
    const timer = setTimeout(dismissCoachmark, 5000);
    return () => clearTimeout(timer);
  }, [showCoachmark, phase, dismissCoachmark]);

  // ── Step 1 to 2 ─────────────────────────────────────────────
  // Takes the order id explicitly rather than reading `orderId` off
  // closure state: Form mode calls this straight from the dropdown's
  // onChange, in the same tick as setOrderId(value), so a stale read
  // would fetch items for the previously selected order.
  const startCounting = async (poId) => {
    setSaving(true);
    setError(null);
    try {
      const items = await receivingAPI.getPurchaseOrderItems(poId);
      const draft = readDraft(`receiving-${poId}`);

      const built = items.map((item) => {
        const fresh = isFreshProduct(item);
        const saved = draft?.counted?.[item.purchase_order_item_id];
        return {
          purchaseOrderItemId: item.purchase_order_item_id,
          productId:  item.product_id,
          name:       item.product_name,
          sku:        item.sku,
          expected:   Number(item.expected_quantity ?? 0),
          expectedKg: item.expected_weight_kg === null ? null : Number(item.expected_weight_kg),
          fresh,
          // Exception-first: start at what the order says, in both
          // modes. Guided used to start every line empty to force an
          // active count; in practice that meant retyping the number
          // already printed on the note, and the notice on a varied
          // line is what actually catches a miscount.
          counted:  saved?.counted ?? String(item.expected_quantity ?? ''),
          location: saved?.location ?? (fresh ? 'cold_room' : 'dry_store'),
          useBy:    saved?.useBy ?? '',
        };
      });

      setLines(built);
      if (draft?.deliveryDate) setDeliveryDate(draft.deliveryDate);
      setPhase('work');
      setFocusId(mode === 'guided' ? (built[0]?.purchaseOrderItemId ?? null) : null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const patchLine = (itemId, patch) =>
    setLines((all) => all.map((line) => (
      line.purchaseOrderItemId === itemId ? { ...line, ...patch } : line
    )));

  const acceptAllAsOrdered = () =>
    setLines((all) => all.map((line) => (
      line.counted === '' ? { ...line, counted: String(line.expected) } : line
    )));

  const focusIndex = lines.findIndex((l) => l.purchaseOrderItemId === focusId);
  const goToNextLine = () => {
    const next = lines[focusIndex + 1];
    setFocusId(next ? next.purchaseOrderItemId : null);
  };

  // What is stopping the commit, said out loud rather than left for
  // someone to work out from a greyed button.
  const missingUseBy = lines.filter((l) => l.fresh && !l.useBy);
  const blockers = [];
  if (lines.some((l) => l.counted === '')) blockers.push('a count on every line');
  if (missingUseBy.length) {
    blockers.push(`a use-by date on ${missingUseBy.length} fresh ${missingUseBy.length === 1 ? 'line' : 'lines'}`);
  }
  if (!signature) blockers.push("the driver's signature");
  const blockedNote = blockers.length ? `Still needed: ${blockers.join(', ')}.` : null;

  // ── Commit ──────────────────────────────────────────────────
  const finish = async () => {
    setSaving(true);
    setError(null);
    try {
      // No driver NAME is recorded here — there is no drivers table and
      // this flow has no field for one. delivery_notes.driver_name is
      // the real column if that is ever added. The driver's signature
      // is captured and does go to delivery_notes.signature.
      const result = await receivingAPI.recordDelivery({
        supplierId,
        deliveryDate,
        purchaseOrderId: orderId,
        signatureData: signature,
        poCompleted: lines.every((l) => Number(l.counted) >= l.expected),
        idempotencyKey: attemptKey,
        lineItems: lines.map((line) => {
          const receivedQuantity = Number(line.counted || 0);
          const variance = receivedQuantity - line.expected;
          return {
            purchaseOrderItemId: line.purchaseOrderItemId,
            receivedQuantity,
            overAction: 'accept', // no reject-the-extra UI on this screen yet
            location: line.location,
            expiryDate: line.fresh ? (line.useBy || null) : null,
            // Short and over counts are recorded structurally rather
            // than typed out by staff — the service still requires a
            // reason for any line that varies, so this is it.
            discrepancyReason:
              variance === 0 ? '' : variance < 0 ? 'Short count at receiving' : 'Over count at receiving',
          };
        }),
      });
      setPhase('done');
      clearDraft(draftKey);
      // recordDelivery's response already carries the full joined
      // record (supplier name, items, po_status).
      setPdfDelivery(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const restart = () => {
    setPhase('which');
    setLines([]);
    setOrderId('');
    setFocusId(null);
    setDeliveryDate(todayISO());
    setSignature(null);
    setPdfDelivery(null);
    // A new delivery is a new attempt. Keeping the old key would make
    // the server treat the next genuine delivery as a replay of the
    // last one and silently record nothing.
    setAttemptKey(newIdempotencyKey());
  };

  if (loading) return <div className="stf-skeleton" aria-label="Loading" />;

  return (
    <>
      {phase !== 'done' ? (
        <div className="stf-toggle-anchor">
          <ViewToggle options={MODES} value={mode} onChange={handleModeChange} />
          <Coachmark show={showCoachmark} onDismiss={dismissCoachmark}>
            Tap here to switch view
          </Coachmark>
        </div>
      ) : null}

      {phase !== 'done' ? <StepRail step={step.n} total={TOTAL_STEPS} label={step.label} /> : null}

      {error ? <Notice tone="warn">{error}</Notice> : null}

      {/* ── 1 · Which delivery ─────────────────────────────── */}
      {phase === 'which' && (
        <StepScreen
          title="Which delivery is this?"
          sub="The driver has a note with a number on it."
          actions={
            <Actions>
              <Button disabled={!orderId || saving} onClick={() => startCounting(orderId)}>
                {saving ? 'Loading the list' : 'Start counting'}
              </Button>
            </Actions>
          }
        >
          {/* Guided keeps tap targets; Form uses the dropdown, which is
              the right control once the list runs to dozens. Both write
              the same supplierId. */}
          {mode === 'guided' ? (
            <ChoiceList
              legend="Who it came from"
              options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
              value={supplierId}
              onChange={(value) => { setSupplierId(value); setOrderId(''); }}
            />
          ) : (
            <SelectField
              id="stf-full-supplier"
              label="Who it came from"
              placeholder="Choose a supplier"
              options={openSuppliers.map((s) => ({ value: s.id, label: s.name }))}
              value={supplierId}
              onChange={(value) => { setSupplierId(value); setOrderId(''); setLines([]); }}
              hint={openSuppliers.length === 0 ? 'No supplier has an approved order right now.' : undefined}
            />
          )}

          <div className="stf-field">
            <span className="stf-field-label">Received by</span>
            <div className="stf-static-value">{receivedByName}</div>
          </div>

          {supplierId && orders.length === 0 ? (
            <Notice>
              There is no open order for {supplierName} today. Ask your manager to check the order
              before you sign anything in.
            </Notice>
          ) : null}

          {orders.length > 0 ? (
            <ChoiceList
              legend="Which order"
              options={orders.map((o) => ({
                value: o.id,
                label: `Order ${o.id}`,
                meta: o.expected_delivery_date
                  ? `Due ${longDate(o.expected_delivery_date)}`
                  : 'No due date given',
              }))}
              value={orderId}
              onChange={setOrderId}
            />
          ) : null}
        </StepScreen>
      )}

      {/* ── 2 · Count and put away ─────────────────────────── */}
      {phase === 'work' && (
        <TaskPage
          title={`${supplierName}${orderId ? ` · Order ${orderId}` : ''}`}
          sub="Check what is on the floor against the note, then sign it in."
          note={blockedNote}
          actions={
            <Actions>
              <Button disabled={saving || blockers.length > 0} onClick={finish}>
                {saving ? 'Saving' : 'Finish this delivery'}
              </Button>
              {mode === 'guided' && focusIndex >= 0 && focusIndex + 1 < lines.length ? (
                <Button variant="secondary" onClick={goToNextLine}>Next item</Button>
              ) : null}
              <Button variant="secondary" onClick={restart}>Start over</Button>
            </Actions>
          }
          side={
            <div className="stf-summary">
              <p className="stf-summary-title">Sign it in</p>
              <DateField
                id="stf-full-date"
                label="Delivery date"
                value={deliveryDate}
                onChange={setDeliveryDate}
              />
              {shortLines.length > 0 ? (
                <Notice tone="warn">
                  {shortLines.length} {shortLines.length === 1 ? 'line is' : 'lines are'} short.
                  Saving still records the delivery, and your manager gets the difference to
                  follow up.
                </Notice>
              ) : null}
              <SignatureField value={signature} onChange={setSignature} />
            </div>
          }
        >
          {hasLines ? (
            <WorkList
              lines={lines.map((line) => ({
                id:       line.purchaseOrderItemId,
                title:    line.name,
                sku:      line.sku,
                expected: line.expected,
                value:    line.counted,
              }))}
              expectedLabel="ordered"
              focusId={mode === 'guided' ? focusId : null}
              onFocus={(id) => setFocusId(mode === 'guided' ? id : null)}
              onChange={(id, value) => patchLine(id, { counted: value })}
              onAcceptAll={acceptAllAsOrdered}
              acceptAllLabel="Everything as ordered"
              renderDetail={(row) => {
                const line = lines.find((l) => l.purchaseOrderItemId === row.id);
                if (!line) return null;
                const counted = line.counted;
                const short = counted !== '' && Number(counted) < line.expected;
                const over  = counted !== '' && Number(counted) > line.expected;
                return (
                  <>
                    <KeyValues
                      pairs={[
                        ['Code', line.sku],
                        ['Ordered', `${line.expected}${line.expectedKg ? ` (${line.expectedKg} kg)` : ''}`],
                        ['Type', line.fresh ? 'Fresh, needs a use-by date' : 'Dry'],
                      ]}
                    />

                    <ChoiceList
                      legend={`Where the ${line.name} is going`}
                      options={LOCATIONS}
                      value={line.location}
                      onChange={(value) => patchLine(line.purchaseOrderItemId, { location: value })}
                    />

                    {/* Fresh only. Dry goods get no date field rather
                        than a disabled one: an empty box staff are told
                        to skip is a box someone eventually fills in
                        wrongly. */}
                    {line.fresh ? (
                      <div className="stf-field">
                        <label
                          className="stf-field-label"
                          htmlFor={`stf-useby-${line.purchaseOrderItemId}`}
                        >
                          What is the date on the box?
                        </label>
                        <input
                          id={`stf-useby-${line.purchaseOrderItemId}`}
                          className="stf-input is-text"
                          type="date"
                          value={line.useBy}
                          onChange={(e) => patchLine(line.purchaseOrderItemId, { useBy: e.target.value })}
                        />
                        <p className="stf-field-hint">
                          Fresh food is packed by date, so this is what decides which box goes out
                          first.
                        </p>
                      </div>
                    ) : null}

                    {short ? (
                      <Notice tone="warn">
                        {line.expected - Number(counted)} fewer than the note says. Your manager
                        will be told, and this delivery stays open until it is sorted out.
                      </Notice>
                    ) : null}
                    {over ? (
                      <Notice tone="warn">
                        That is more than the note says. Count again, and if it is right your
                        manager will check it against the order.
                      </Notice>
                    ) : null}
                  </>
                );
              }}
            />
          ) : (
            <Notice>This order has no lines to receive.</Notice>
          )}
        </TaskPage>
      )}

      {/* ── Done ───────────────────────────────────────────── */}
      {phase === 'done' && (
        <StepScreen
          title="Delivery received"
          sub="The stock is on the system. You can put the next one in, or move on to packing."
          actions={
            <Actions>
              <Button onClick={restart}>Receive another delivery</Button>
            </Actions>
          }
        />
      )}

      {/* The note pops up the moment it can be fetched back in full;
          closing it just clears the state above — the delivery itself
          is already saved. */}
      {pdfDelivery ? (
        <DeliveryNotePDF delivery={pdfDelivery} onClose={() => setPdfDelivery(null)} />
      ) : null}
    </>
  );
}
""", "ReceivingFlow.jsx: page, focus mode, dense rows, accept-all, draft")


patch(GATE,
"""const STATE = {""",
"""// 16:00 SAST is when the sweep writes off whatever is still standing
// (BR-14). Computed in Africa/Johannesburg rather than from the
// tablet's own clock: a device left on another timezone would other-
// wise count down to the wrong moment, and this is the one number on
// the screen a worker might act on.
const CUTOFF_HOUR = 16;

const sastHourMinute = () => {
  const parts = new Intl.DateTimeFormat('en-ZA', {
    timeZone: 'Africa/Johannesburg',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const get = (type) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { hour: get('hour'), minute: get('minute') };
};

const cutoffNote = () => {
  const { hour, minute } = sastHourMinute();
  const left = CUTOFF_HOUR * 60 - (hour * 60 + minute);
  if (left <= 0) return 'past the 16:00 cut-off';
  const h = Math.floor(left / 60);
  const m = left % 60;
  return h > 0 ? `${h}h ${m}m to the 16:00 cut-off` : `${m}m to the 16:00 cut-off`;
};

const STATE = {""",
"gate queue: SAST cut-off helper")

# ══════════════════════════════════════════════════════════════
print("7  gate queue cut-off (fix 3)")
# ══════════════════════════════════════════════════════════════

patch(GATE,
"""            if (row.dispatch_status === 'not_collected') {
              meta = 'Awaiting late collection. Written off at 16:00.';
            } else if (at) {""",
"""            if (row.dispatch_status === 'not_collected') {
              // Was "Awaiting late collection. Written off at 16:00."
              // on every such row at any hour and with no date, which
              // reads at 22:41 as though it had just happened. What a
              // person at the gate needs to know is what collecting it
              // now actually does.
              meta = 'Written off as not collected. Collecting it now records a late collection.';
            } else if (at) {""",
"gate queue: written-off rows say what happens next")

patch(GATE,
"""              const flags = [];
              if (Number(row.flagged_items) > 0)  flags.push(`${row.flagged_items} flagged`);
              if (Number(row.variance_items) > 0) flags.push(`${row.variance_items} short or over`);
              meta = [`${row.total_items} items ready for dispatch`, ...flags].join(' \u00b7 ');""",
"""              const flags = [];
              if (Number(row.flagged_items) > 0)  flags.push(`${row.flagged_items} flagged`);
              if (Number(row.variance_items) > 0) flags.push(`${row.variance_items} short or over`);
              // The live cut-off, which is the thing that changes while
              // someone is standing there. Static text saying 16:00 tells
              // a worker nothing they cannot read off the wall clock.
              meta = [`${row.total_items} items ready for dispatch`, ...flags, cutoffNote()].join(' \u00b7 ');""",
"gate queue: awaiting rows carry the live cut-off")

# ══════════════════════════════════════════════════════════════
print("8  tests")
# ══════════════════════════════════════════════════════════════

write_file('client/src/tests/StaffWorkList.test.jsx', """// ─────────────────────────────────────────────────────────────
// StaffWorkList.test.jsx
//
// The pieces the staff-flow rework turns on:
//   - a line list dense enough to see a whole job at once
//   - "everything as expected" filling only what is still blank
//   - drafts surviving a reload without ever submitting anything
//
// The flows themselves (ReceivingFlow, PalletCheck) are covered by
// DispatchWiring.test.jsx and by hand; these are the shared parts that
// both depend on and that have real invariants worth pinning.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { default: WorkList } = await import('../features/staff/components/WorkList');
const { readDraft, writeDraft, clearDraft } = await import('../features/staff/hooks/useDraft');

const LINES = [
  { id: 1, title: 'Butternut',   sku: 'VEG-BUTT',   expected: 1,  unit: 'crate', value: '1'  },
  { id: 2, title: 'Maize meal',  sku: 'MEAL-MAIZE', expected: 35, unit: 'kg',    value: '35' },
  { id: 3, title: 'Pilchards',   sku: 'FISH-400',   expected: 12, unit: 'tin',   value: ''   },
];

beforeEach(() => {
  try { localStorage.clear(); } catch { /* private window */ }
});

describe('WorkList', () => {
  it('shows every line at once rather than one at a time', () => {
    render(<WorkList lines={LINES} onChange={vi.fn()} />);
    expect(screen.getByText('Butternut')).toBeInTheDocument();
    expect(screen.getByText('Maize meal')).toBeInTheDocument();
    expect(screen.getByText('Pilchards')).toBeInTheDocument();
  });

  it('reports progress across the whole job', () => {
    render(<WorkList lines={LINES} onChange={vi.fn()} />);
    expect(screen.getByText(/2 of 3 checked/)).toBeInTheDocument();
  });

  it('counts how many lines differ from what was expected', () => {
    const varied = [{ ...LINES[0], value: '0' }, LINES[1], LINES[2]];
    render(<WorkList lines={varied} onChange={vi.fn()} />);
    expect(screen.getByText(/1 different/)).toBeInTheDocument();
  });

  it('offers accept-all only while something is unfilled', () => {
    const { rerender } = render(<WorkList lines={LINES} onChange={vi.fn()} onAcceptAll={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Everything as expected/ })).toBeInTheDocument();

    rerender(
      <WorkList
        lines={LINES.map((l) => ({ ...l, value: String(l.expected) }))}
        onChange={vi.fn()}
        onAcceptAll={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /Everything as expected/ })).not.toBeInTheDocument();
  });

  it('steps a quantity by one without opening a keyboard', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<WorkList lines={LINES} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'One more Maize meal' }));
    expect(onChange).toHaveBeenLastCalledWith(2, '36');

    await user.click(screen.getByRole('button', { name: 'One fewer Maize meal' }));
    expect(onChange).toHaveBeenLastCalledWith(2, '34');
  });

  it('never steps below zero', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<WorkList lines={[{ ...LINES[0], value: '0' }]} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'One fewer Butternut' }));
    expect(onChange).toHaveBeenLastCalledWith(1, '0');
  });

  it('opens the detail accordion only for the focused line', () => {
    render(
      <WorkList
        lines={LINES}
        focusId={2}
        onChange={vi.fn()}
        renderDetail={(line) => <p>detail for {line.title}</p>}
      />,
    );
    expect(screen.getByText('detail for Maize meal')).toBeInTheDocument();
    expect(screen.queryByText('detail for Butternut')).not.toBeInTheDocument();
  });

  it('normalises a comma to a full stop, since a ZA keyboard makes both', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<WorkList lines={[{ ...LINES[0], value: '' }]} onChange={onChange} />);

    await user.type(screen.getByRole('textbox', { name: /Butternut, quantity/ }), '1,5');
    expect(onChange).toHaveBeenLastCalledWith(1, '5');
  });
});

describe('drafts', () => {
  it('round-trips a draft', () => {
    writeDraft('receiving-9', { counted: { 4: '12' } });
    expect(readDraft('receiving-9')).toEqual({ counted: { 4: '12' } });
  });

  it('keeps two jobs apart', () => {
    writeDraft('receiving-9', { counted: { 4: '12' } });
    writeDraft('dispatch-31', { loaded: { 7: '3' } });
    expect(readDraft('receiving-9').counted).toEqual({ 4: '12' });
    expect(readDraft('dispatch-31').loaded).toEqual({ 7: '3' });
  });

  it('clears one without touching the other', () => {
    writeDraft('receiving-9', { counted: {} });
    writeDraft('dispatch-31', { loaded: {} });
    clearDraft('receiving-9');
    expect(readDraft('receiving-9')).toBeNull();
    expect(readDraft('dispatch-31')).not.toBeNull();
  });

  it('ignores a draft older than a day rather than refilling a stale count', () => {
    const twoDays = Date.now() - 2 * 24 * 60 * 60 * 1000;
    localStorage.setItem('stf_draft_receiving-9', JSON.stringify({ savedAt: twoDays, data: { counted: {} } }));
    expect(readDraft('receiving-9')).toBeNull();
  });

  it('survives unparseable storage instead of throwing into a render', () => {
    localStorage.setItem('stf_draft_receiving-9', 'not json');
    expect(readDraft('receiving-9')).toBeNull();
  });

  it('does nothing at all without a key', () => {
    expect(readDraft(null)).toBeNull();
    expect(() => writeDraft(null, { a: 1 })).not.toThrow();
    expect(() => clearDraft(null)).not.toThrow();
  });
});
""", "client/src/tests/StaffWorkList.test.jsx")

# ── Report ────────────────────────────────────────────────────
print("")
if FAILED:
    print("ABORTED — the failures below were not applied:")
    for f in FAILED:
        print("  ! %s" % f)
    print("")
    print("%d change(s) applied before the failure." % CHANGES)
    sys.exit(1)

print("%d change(s) applied." % CHANGES)
PYEOF