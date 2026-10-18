// ─────────────────────────────────────────────────────────────
// server/scripts/evalReportingQuestions.js
//
// Puts every question in src/features/reporting/phrasings.js to the
// live model, through the same reportingAi.ask the page uses, and
// scores the answers: right first time, and right within the
// "Not what you meant? Try:" suggestions.
//
//     node scripts/evalReportingQuestions.js            # all
//     node scripts/evalReportingQuestions.js holdout    # holdout only
//
// Spaced out (GAP_MS, default 5s) to stay inside the free tier.
// ─────────────────────────────────────────────────────────────
import 'dotenv/config';

const { PHRASINGS, answerId } = await import('../src/features/reporting/phrasings.js');
const { ask } = await import('../src/services/reportingAi.service.js');

const only = process.argv[2];
const set = only === 'holdout' ? PHRASINGS.filter((p) => p.holdout) : PHRASINGS;
const gap = Number(process.env.GAP_MS ?? 5000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let first = 0; let within = 0; let errors = 0; let keyword = 0;
const rows = [];
for (const p of set) {
  let got = null; let alts = []; let note = '';
  try {
    const r = await ask({ question: p.q, userId: null });
    if (r.type === 'clarify') note = `asked: ${r.question}`;
    else if (r.type === 'no_match') note = 'no match';
    else { got = answerId(r); alts = (r.alternatives ?? []).map(answerId); }
    if (r.meta?.matchedBy === 'keyword' || r.matchedBy === 'keyword') { keyword += 1; note += ' (keyword fallback)'; }
  } catch (e) { errors += 1; note = `ERROR ${e.message}`; }
  const ok1 = p.expect.includes(got);
  const ok3 = ok1 || alts.some((a) => p.expect.includes(a));
  if (ok1) first += 1;
  if (ok3) within += 1;
  rows.push(`${ok1 ? 'ok ' : ok3 ? '~  ' : 'X  '}${p.holdout ? '[holdout] ' : ''}${p.q}\n     → ${got ?? '-'} ${note}${ok1 ? '' : `   (wanted ${p.expect.join(' / ')})`}`);
  console.log(rows[rows.length - 1]);
  await sleep(gap);
}
console.log(`\n${first}/${set.length} right first time, ${within}/${set.length} within the suggestions. ${keyword} answered by the keyword fallback, ${errors} errors.`);
process.exit(0);
