#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# fix-task-card.sh
#
# Adds the Reporting & Analytics card to the manager dashboard.
#
# WHAT WENT WRONG
# reporting-frontend.sh matched a literal template string containing
# \n against a file Git checked out with CRLF, so the card insert
# silently no-opped while the import above it (a single line, so
# unaffected) succeeded.
#
# reporting-fix-card.sh then made it worse: it treated the presence
# of `reportingIcon` — the import — as proof the whole patch had
# applied, so it skipped the half that was actually missing.
#
# This script checks for the CARD, handles both line endings, and
# preserves whichever the file already uses.
#
#     bash fix-task-card.sh
# ─────────────────────────────────────────────────────────────
set -euo pipefail

FILE="client/src/pages/ManagerActivityScreen.jsx"

if [ ! -f "$FILE" ]; then
  echo "ERROR: run from the repo root ($FILE not found)." >&2
  echo "       You are in: $(pwd)" >&2
  exit 1
fi

node - <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'client/src/pages/ManagerActivityScreen.jsx';
const original = readFileSync(FILE, 'utf8');

// Remember the file's line endings and restore them on write, so
// this does not show up as a whole-file diff in the PR.
const wasCRLF = original.includes('\r\n');
let s = original.replace(/\r\n/g, '\n');

let changed = false;

// ── 1. Import (may already be there from the failed run) ─────
if (!s.includes('reportingIcon')) {
  const before = s;
  s = s.replace(
    /(import\s+dispatchIcon\s+from\s+["'][^"']+["'];)/,
    `$1\nimport reportingIcon from "./../../public/icons/reporting-icon.svg";`
  );
  if (s === before) {
    console.error('FAIL: could not find the dispatchIcon import line.');
    process.exit(2);
  }
  console.log('  added  reportingIcon import');
  changed = true;
} else {
  console.log('  ok     reportingIcon import already present');
}

// ── 2. The task card ─────────────────────────────────────────
// Marker is the CARD, not the import — that distinction is the
// whole reason the previous script skipped this step.
if (!s.includes('/noc/reporting')) {
  const before = s;
  s = s.replace(
    /^([ \t]*)\{[ \t]*\n([ \t]*)to:[ \t]*["']\/noc\/inventory["'],/m,
    `$1{\n$2to: "/noc/reporting",\n$2icon: reportingIcon,\n$2title: "Reporting & Analytics",\n$2disabled: false,\n$1},\n$1{\n$2to: "/noc/inventory",`
  );
  if (s === before) {
    console.error('FAIL: could not find the /noc/inventory task entry.');
    console.error('      Paste the `tasks` array from the file and it can be done by hand.');
    process.exit(2);
  }
  console.log('  added  Reporting & Analytics task card');
  changed = true;
} else {
  console.log('  ok     task card already present');
}

if (changed) {
  writeFileSync(FILE, wasCRLF ? s.replace(/\n/g, '\r\n') : s);
  console.log(`  wrote  ${FILE} (${wasCRLF ? 'CRLF' : 'LF'} preserved)`);
} else {
  console.log('  nothing to do');
}
NODE

echo
echo "═══ Verify ═══"
if grep -q "Reporting & Analytics" "$FILE" && grep -q "/noc/reporting" "$FILE"; then
  echo "  PASS  card is present"
  grep -n "noc/reporting\|Reporting & Analytics\|reportingIcon" "$FILE"
else
  echo "  FAIL  card still missing" >&2
  exit 2
fi

echo
echo "Restart Vite, then hard-refresh (Ctrl+Shift+R)."
echo "If the card still does not appear: DevTools > Application >"
echo "Service Workers > Unregister, then reload. The PWA precache"
echo "will happily serve you the old dashboard."