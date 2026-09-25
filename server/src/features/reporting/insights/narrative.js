// ─────────────────────────────────────────────────────────────
// server/src/features/reporting/insights/narrative.js
//
// The written reading of an operational report: a headline, what
// happened, what the related charts add, what it means for the
// operation, and up to three next steps.
//
// THE MODEL WRITES WORDS, NEVER NUMBERS IT WAS NOT GIVEN
// It receives the figures already computed from pg — the main
// series, the previous period, the related charts, and how long
// each "who to act on" list is. It never receives the lists
// themselves (contact names, phone numbers), only their titles and
// counts, and is told to say "listed below".
//
// ALWAYS PRESENT
// Without a key, or when the model is busy, slow or returns
// something unusable, the same sections are written from the figures
// by fallbackNarrative(). A missing field in a model reply takes the
// templated version of that one field, so no section is ever blank.
// ─────────────────────────────────────────────────────────────
import provider from '../ai/provider.js';

const STRING = 'STRING', ARRAY = 'ARRAY', OBJECT = 'OBJECT';

const MAX_MAIN_ROWS    = 25;
const MAX_RELATED_ROWS = 12;

const fmt = (n, unit) => {
  const v = Number(n ?? 0);
  if (unit === 'ZAR') return `R${v.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;
  if (unit === 'ZAR/unit') return `R${v.toLocaleString('en-GB', { maximumFractionDigits: 2 })} per unit`;
  if (unit === '%') return `${v.toLocaleString('en-GB', { maximumFractionDigits: 1 })}%`;
  return `${v.toLocaleString('en-GB', { maximumFractionDigits: 1 })} ${unit ?? ''}`.trim();
};

export const narrativeTool = {
  name: 'write_report',
  description: 'Write the short report that sits around the charts. Use only the figures provided.',
  parameters: {
    type: OBJECT,
    properties: {
      headline: {
        type: STRING,
        description: 'One sentence, at most 20 words, stating the single most important finding with its number.',
      },
      what_happened: {
        type: STRING,
        description: 'Two to four sentences: what the main figure shows, and how it compares with the previous period where one is given.',
      },
      context: {
        type: STRING,
        description: 'Two to three sentences: what the related charts add to the picture. Empty string if there are none.',
      },
      meaning: {
        type: STRING,
        description: 'Two to four sentences: what this means for the running of the warehouse, read through the lens given, and whether it is healthy.',
      },
      next_steps: {
        type: ARRAY, items: { type: STRING },
        description: 'One to three short, concrete actions, each starting with a verb. Refer to the lists below where they exist.',
      },
    },
    required: ['headline', 'what_happened', 'meaning', 'next_steps'],
  },
};

const SYSTEM_PROMPT = `You write short operational reports for the warehouse manager at Ladles of Love, a Cape Town food charity. You are given figures that have already been calculated from the warehouse database. Turn them into a clear, practical reading the manager can act on.

RULES
- Use ONLY the numbers in the data you are given. Never estimate, extrapolate or invent a figure, a name or a cause. If a cause is not in the data, say what to check, not what happened.
- Plain South African English. Rands as R1 234. Short sentences. No jargon, no hype, no emojis.
- Where a previous period is given, say whether things got better or worse, using better_direction to judge which way is good.
- If the data is thin (a total of zero, one or two rows, or very few lines), say so plainly instead of drawing a pattern from it.
- follow_up lists the names the app prints under your text. You are told only what each list is and how long it is. Say "listed below", never guess who is on it.
- Aggregate figures only for donations and volunteers. Never speculate about individual donors, callers or volunteers.
- The caveat describes what the figure leaves out. Mention it when it changes how the number should be read.`;

const rowsOf = (series, max) =>
  (series ?? []).slice(0, max).map((r) => ({ label: r.label, value: r.value }));

export const buildPayload = ({ metric, lens, report, previous, figures, related, actions, target }) => ({
  report: {
    name: metric.label,
    what_it_measures: metric.description,
    question_answered: report.description,
    unit: metric.unit,
    caveat: metric.caveat ?? null,
    period: report.spec.dateRange ?? 'live, as it stands now',
    total: report.total,
    better_direction: figures.better ?? 'neither',
    // A working target, not an agreed KPI: "against the working target".
    working_target: target ? { value: target.value, label: target.label } : null,
    rows: rowsOf(report.series, MAX_MAIN_ROWS),
    rows_truncated: report.series.length > MAX_MAIN_ROWS,
  },
  previous_period: previous
    ? { period: previous.dateRange, total: previous.total, change_pct: previous.changePct, no_data: Boolean(previous.empty) }
    : null,
  key_figures: figures.items.map((f) => ({ label: f.label, value: f.value, unit: f.unit, note: f.note ?? null })),
  related: related.map((r) => ({
    name: r.description,
    unit: r.meta?.unit,
    total: r.total,
    rows: rowsOf(r.series, MAX_RELATED_ROWS),
  })),
  follow_up: actions.map((a) => ({ list: a.title, count: a.total, action: a.intro })),
  lens,
});

// ── Template, from the figures alone ──────────────────────────
export const fallbackNarrative = ({ metric, lens, report, previous, figures, related, actions }) => {
  const unit  = metric.unit;
  const total = fmt(report.total, unit);
  const rows  = report.series ?? [];

  let headline;
  if (rows.length === 0) {
    headline = `No ${metric.label.toLowerCase()} recorded for this ${report.spec.dateRange ? 'period' : 'moment'}.`;
  } else if (previous?.changePct != null) {
    const dir = previous.changePct > 0 ? 'up' : previous.changePct < 0 ? 'down' : 'unchanged';
    headline = dir === 'unchanged'
      ? `${metric.label} held steady at ${total}.`
      : `${metric.label} ${dir} ${Math.abs(previous.changePct)}% on the previous period, at ${total}.`;
  } else {
    const lead = figures.items[0];
    headline = `${lead.label}: ${fmt(lead.value, lead.unit)}.`;
  }

  const what = [];
  what.push(`${report.description}.`);
  if (figures.items[1]) what.push(`${figures.items[1].label}: ${fmt(figures.items[1].value, figures.items[1].unit)}${figures.items[1].note ? ` (${figures.items[1].note})` : ''}.`);
  if (previous?.empty) what.push(`Nothing was recorded in the previous period (${previous.dateRange.from} to ${previous.dateRange.to}), so there is no comparison.`);
  else if (previous) what.push(`The previous period, ${previous.dateRange.from} to ${previous.dateRange.to}, came to ${fmt(previous.total, unit)}.`);
  if (report.spec.dimension !== 'none' && rows.length > 0 && rows.length <= 2) what.push('There are very few records behind this, so treat it as an early signal rather than a pattern.');

  const context = related.length
    ? related.map((r) => {
        const top = [...(r.series ?? [])].sort((a, b) => b.value - a.value)[0];
        return top
          ? `${r.description}: highest is ${top.label} at ${fmt(top.value, r.meta?.unit)}.`
          : `${r.description}: nothing recorded.`;
      }).join(' ')
    : '';

  const open = actions.filter((a) => a.total > 0);
  const meaning = [
    lens,
    open.length
      ? `There ${open.length === 1 ? 'is one list' : `are ${open.length} lists`} below of who to follow up with.`
      : actions.length ? 'Nothing currently needs following up.' : '',
    metric.caveat ? `Note: ${metric.caveat}` : '',
  ].filter(Boolean).join(' ');

  const nextSteps = open.length
    ? open.slice(0, 3).map((a) => a.intro)
    : ['Re-run this report next week to see whether the figure holds.'];

  return { headline, whatHappened: what.join(' '), context, meaning, nextSteps, source: 'template' };
};

const clean = (s, max) => (typeof s === 'string' ? s.trim().slice(0, max) : '');

export const writeNarrative = async (input) => {
  const fallback = fallbackNarrative(input);
  if (!provider.isEnabled()) return fallback;

  try {
    const call = await provider.callWithTools({
      systemPrompt: SYSTEM_PROMPT,
      userMessage: JSON.stringify(buildPayload(input)),
      tools: [narrativeTool],
    });
    if (call.name !== 'write_report') return fallback;

    const a = call.args ?? {};
    const steps = Array.isArray(a.next_steps)
      ? a.next_steps.map((x) => clean(x, 240)).filter(Boolean).slice(0, 3)
      : [];

    return {
      headline:     clean(a.headline, 200)      || fallback.headline,
      whatHappened: clean(a.what_happened, 900) || fallback.whatHappened,
      context:      clean(a.context, 700)       || fallback.context,
      meaning:      clean(a.meaning, 900)       || fallback.meaning,
      nextSteps:    steps.length ? steps : fallback.nextSteps,
      source: 'ai',
    };
  } catch (err) {
    // A busy or missing model is not the manager's problem here: the
    // report is still useful, so it is written from the figures and
    // the page says which it is.
    console.warn('[insight.narrative] falling back:', err.message);
    return { ...fallback, fallbackReason: err.message };
  }
};

export default { writeNarrative, fallbackNarrative, buildPayload, narrativeTool };
