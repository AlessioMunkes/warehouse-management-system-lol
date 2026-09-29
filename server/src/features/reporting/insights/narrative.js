// ─────────────────────────────────────────────────────────────
// server/src/features/reporting/insights/narrative.js
//
// The written reading of an operational report, in the order the
// page shows it:
//   1. explanation   — what the chart shows and how to read it, for
//                      someone who has never seen it before
//   2. comparison    — against the previous period and the related charts
//   3. business view — what it means against Ladles of Love's
//                      operational requirements, and whether they are met
//   4. next steps    — which lead into the Actions lists
// plus a one-line headline.
//
// THE MODEL WRITES WORDS, NEVER NUMBERS IT WAS NOT GIVEN
// It receives the figures already computed from pg — the main
// series, the previous period, the related charts, and how long
// each Actions list is. It never receives the lists
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
import { DIMENSIONS } from '../reportCatalog.js';
import { pseudonymise, restore } from '../../privacy/redact.js';

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
      explanation: {
        type: STRING,
        description:
          'Four to six sentences explaining the chart to someone who has never seen it: what is being measured and in what ' +
          'unit, what each bar, point or row stands for, the period covered, the total, which items are highest and lowest ' +
          'with their numbers, and the overall shape (rising, falling, even, one item dominating). If a working target is ' +
          'given, say what the dashed line is and how many items are on the right side of it.',
      },
      what_happened: {
        type: STRING,
        description: 'Two to three sentences: how this compares with the previous period where one is given, and what the related charts add. Empty string if there is neither.',
      },
      business_view: {
        type: STRING,
        description:
          'Four to six sentences reading the figures as the Ladles of Love operations team would: which of the operational ' +
          'requirements this touches, whether it is being met (use the working target and better_direction), what the risk ' +
          'is to the centres, families or donors if it is not, and what deserves attention first.',
      },
      next_steps: {
        type: ARRAY, items: { type: STRING },
        description: 'One to three short, concrete actions, each starting with a verb. Refer to the lists below where they exist.',
      },
      related_connections: {
        type: ARRAY, items: { type: STRING },
        description:
          'One or two sentences for each related chart, in the order given: how it connects to the main chart and what ' +
          'reading them together shows, citing a figure from each where it helps. why_shown says why it was chosen.',
      },
    },
    required: ['headline', 'explanation', 'business_view', 'next_steps'],
  },
};

const SYSTEM_PROMPT = `You write short operational reports for the warehouse manager at Ladles of Love, a Cape Town food charity. You are given figures that have already been calculated from the warehouse database. Turn them into a clear, practical reading the manager can act on.

WHAT THE OPERATION NEEDS (read the business view against these)
- Every registered centre — ECD centres (creches), soup kitchens and dignity kitchens — gets its allocation on its
  collection day. A missed or short collection means children and families go without that week.
- Stock goes out oldest and soonest-to-expire first, and nothing expires on the shelf. Low stock is reordered in time.
- Deliveries match the purchase order; short or wrong deliveries are chased with the supplier.
- Decanting wastage stays within its working limit; loss is recorded honestly, not hidden.
- Money is accountable: purchase orders are captured for Finance, and spend is visible by supplier.
- Donations are valued and Section 18A certificates issued, so donors keep giving.
- Phoned-in and walk-in (benevolent) requests are answered, not left waiting.
- Volunteer time is recorded, because it is free capacity the operation relies on.

RULES
- Use ONLY the numbers in the data you are given. Never estimate, extrapolate or invent a figure, a name or a cause. If a cause is not in the data, say what to check, not what happened.
- Plain South African English. Rands as R1 234. Short sentences. No jargon, no hype, no emojis. Write the explanation so a volunteer or a board member could follow it.
- Where a previous period is given, say whether things got better or worse, using better_direction to judge which way is good.
- If the data is thin (a total of zero, one or two rows, or very few lines), say so plainly instead of drawing a pattern from it.
- follow_up lists the names the app prints under your text. You are told only what each list is and how long it is. Say "listed below", never guess who is on it.
- Aggregate figures only for donations and volunteers. Never speculate about individual donors, callers or volunteers.
- The caveat describes what the figure leaves out. Mention it when it changes how the number should be read.`;

// Status codes read as words ("in transit", not "in_transit"), so the
// model writes them that way too.
const rowsOf = (series, max) =>
  (series ?? []).slice(0, max).map((r) => ({ label: String(r.label).replace(/_/g, ' '), value: r.value }));

export const buildPayload = ({ metric, lens, report, previous, figures, related, actions, target }) => ({
  report: {
    name: metric.label,
    each_row_is: DIMENSIONS[report.spec.dimension]?.label ?? report.spec.dimension,
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
    why_shown: r.why ?? null,
    unit: r.meta?.unit,
    total: r.total,
    rows: rowsOf(r.series, MAX_RELATED_ROWS),
  })),
  follow_up: actions.map((a) => ({ list: a.title, count: a.total, action: a.intro })),
  lens,
});

// ── Template, from the figures alone ──────────────────────────
export const fallbackNarrative = (input) => {
  const { metric, lens, report, previous, figures, related, actions } = input;
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

  const explanation = explainChart({ metric, report, target: input.target });
  const businessView = businessRead({ metric, lens, report, previous, figures, actions, target: input.target });

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

  return {
    headline, explanation,
    // The comparison: everything after the first sentence (which the
    // explanation already covers), plus the related charts.
    whatHappened: [what.slice(1).join(' '), context].filter(Boolean).join(' '),
    context, businessView, meaning, nextSteps, source: 'template',
    // How each related chart connects: the reason it was picked.
    relatedConnections: (related ?? []).map((r) => r.why ?? ''),
  };
};

// ── The chart in words, from its shape ─────────────────────────
// Used when there is no model, and as the fallback for a missing
// field. Says what one bar is, the total, the highest and lowest, the
// direction over time and where the target line sits.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const rowLabel = (label, dim) => {
  const s = String(label ?? '');
  if (dim === 'month' && /^\d{4}-\d{2}$/.test(s)) return `${MONTHS[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}`;
  if (dim === 'week' && /^\d{4}-W\d{2}$/.test(s)) return `week ${Number(s.slice(6))} of ${s.slice(0, 4)}`;
  return s.replace(/_/g, ' ');
};

export const explainChart = ({ metric, report, target }) => {
  const unit = metric.unit;
  const unitWord = unit === '%' ? 'percent' : unit;
  const dim = report.spec.dimension;
  // A custom report names its own grouping ("outcome", "supplier").
  const dimLabel = (report.meta?.groupLabels?.[0] ?? DIMENSIONS[dim]?.label ?? dim ?? '').toLowerCase();
  const rows = report.series ?? [];
  const range = report.spec.dateRange;
  const period = range ? `from ${range.from} to ${range.to}` : 'as things stand today';
  const out = [];

  const what = metric.description ? ` (${metric.description.replace(/\.$/, '').replace(/^\w/, (c) => c.toLowerCase())})` : '';
  out.push(`This report shows ${metric.label.toLowerCase()}${what}, ${period}.`);
  if (rows.length === 0) {
    out.push('Nothing was recorded in this period, so the chart is empty.');
    return out.join(' ');
  }

  if (dim === 'none') {
    out.push(`It is a single figure: ${fmt(report.total, unit)} in total.`);
  } else {
    const timeLike = dim === 'month' || dim === 'week';
    out.push(timeLike
      ? `Each bar or point is one ${dimLabel}, in time order, and its height is the amount in ${unitWord}.`
      : `Each bar is one ${dimLabel}, and its length is the amount in ${unitWord}. There ${rows.length === 1 ? 'is 1' : `are ${rows.length}`} on the chart.`);
    const sorted = [...rows].sort((a, b) => b.value - a.value);
    const hi = sorted[0];
    const lo = sorted[sorted.length - 1];
    if (unit !== '%') out.push(`Together they come to ${fmt(report.total, unit)}.`);
    if (rows.length > 1) {
      const share = unit !== '%' && report.total > 0 ? `, ${Math.round((hi.value / report.total) * 100)}% of the total` : '';
      out.push(`The highest is ${rowLabel(hi.label, dim)} at ${fmt(hi.value, unit)}${share}; the lowest is ${rowLabel(lo.label, dim)} at ${fmt(lo.value, unit)}.`);
    }
    if (timeLike && rows.length > 2) {
      const first = rows[0].value;
      const last = rows[rows.length - 1].value;
      out.push(last > first ? 'Across the period the figure rose overall.'
        : last < first ? 'Across the period the figure fell overall.' : 'Across the period it ended where it started.');
      out.push('The latest period may still be incomplete.');
    }
    if (rows.length <= 2) out.push('There are very few records behind it, so read it as an early signal rather than a pattern.');
  }

  if (target?.value != null) {
    const onSide = rows.filter((r) => (target.better === 'down' ? r.value <= target.value : r.value >= target.value)).length;
    out.push(`The dashed line is the working ${target.better === 'down' ? 'limit' : 'target'} of ${fmt(target.value, unit)}: ${onSide} of ${rows.length} ${rows.length === 1 ? 'is' : 'are'} on the right side of it.`);
  }
  return out.join(' ');
};

// ── The business view, from the figures ───────────────────────
// The area's lens (what the operation needs from it), then whether the
// latest figure meets its target, which way it is moving, and what the
// Actions below are for.
export const businessRead = ({ metric, lens, report, previous, figures, actions, target }) => {
  const out = [];
  // The lens is written for the model ("...Read the figures for...");
  // on the page only the requirement itself, the part before that, reads.
  if (lens) out.push(lens.split(/\s+Read the figures/)[0]);

  if (target?.value != null && report.series?.length) {
    const latest = report.spec.dimension === 'none' ? report.total : report.series[report.series.length - 1].value;
    const word = target.better === 'down' ? 'limit' : 'target';
    const ok = target.better === 'down' ? latest <= target.value : latest >= target.value;
    out.push(ok
      ? `On the latest figure the operation is within its working ${word} of ${fmt(target.value, metric.unit)}.`
      : `On the latest figure the operation is outside its working ${word} of ${fmt(target.value, metric.unit)}, so the requirement it stands for is at risk.`);
  }

  const better = figures.better;
  if (previous?.changePct != null && better && better !== 'neither') {
    const change = previous.changePct;
    const good = (better === 'up' && change > 0) || (better === 'down' && change < 0);
    const moved = `${Math.abs(change)}% ${change > 0 ? 'up' : 'down'} on the previous period`;
    out.push(change === 0 ? 'It has held steady since the previous period.'
      : good ? `It is moving the right way, ${moved}.`
        : `It is moving the wrong way, ${moved}, and is worth attention before it becomes a pattern.`);
  }

  const open = (actions ?? []).filter((a) => a.total > 0);
  if (open.length) out.push(`The Actions below list who to follow up with first: ${open.map((a) => a.title.toLowerCase()).join('; ')}.`);
  else if ((actions ?? []).length) out.push('Nothing currently needs following up.');

  if (metric.caveat) out.push(`Keep in mind: ${metric.caveat}`);
  return out.join(' ');
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

    const businessView = clean(a.business_view, 1400) || fallback.businessView;
    return {
      headline:     clean(a.headline, 200)      || fallback.headline,
      explanation:  clean(a.explanation, 1400)  || fallback.explanation,
      whatHappened: clean(a.what_happened, 900) || fallback.whatHappened,
      context:      '',
      businessView,
      // Older readers of the narrative read `meaning`.
      meaning:      businessView,
      nextSteps:    steps.length ? steps : fallback.nextSteps,
      // One per related chart; a missing or empty one falls back to
      // why the chart was picked.
      relatedConnections: fallback.relatedConnections.map((why, i) =>
        (Array.isArray(a.related_connections) ? clean(a.related_connections[i], 400) : '') || why),
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

// ── Comparisons (scatter plots) ───────────────────────────────
// The same four sections for a two-measure scatter: what the dots and
// axes are, the averages and the corners, then the business view
// against the comparison's own lens. The Actions list is the dots in
// the corner that needs attention, computed in the service.
const MAX_POINTS = 40;

const fmtAxis = (v, axis) => fmt(v, axis.unit === 'ZAR/unit' ? 'ZAR/unit' : axis.unit === '%' ? '%' : axis.unit);

export const fallbackComparisonNarrative = ({ def, comparison, flagged }) => {
  const pts = comparison.points ?? [];
  const { x, y } = def;
  const range = comparison.dateRange;
  const avg = comparison.averages ?? { x: 0, y: 0 };
  const one = def.unitLabel ?? 'item';

  if (pts.length === 0) {
    const empty = `Nothing was recorded between ${range.from} and ${range.to}, so there are no dots on the chart.`;
    return {
      headline: `No data for ${def.label.toLowerCase()} in this period.`,
      explanation: empty, whatHappened: '', context: '',
      businessView: def.lens ?? '', meaning: def.lens ?? '',
      nextSteps: ['Widen the period and run it again.'], source: 'template',
    };
  }

  const byX = [...pts].sort((a, b) => b.x - a.x);
  const byY = [...pts].sort((a, b) => b.y - a.y);
  const explanation = [
    `This scatter chart compares two things for each ${one}, from ${range.from} to ${range.to}.`,
    `Each dot is one ${one}: how far right it sits is its ${x.label.toLowerCase()}, and how high it sits is its ${y.label.toLowerCase()}.`,
    `There ${pts.length === 1 ? 'is 1 dot' : `are ${pts.length} dots`}. The dashed lines are the averages: ${fmtAxis(avg.x, x)} across and ${fmtAxis(avg.y, y)} up, which split the chart into four corners.`,
    `Furthest right is ${byX[0].label} at ${fmtAxis(byX[0].x, x)}; highest is ${byY[0].label} at ${fmtAxis(byY[0].y, y)}.`,
    pts.length <= 3 ? 'With so few dots, read this as an early signal rather than a pattern.' : '',
  ].filter(Boolean).join(' ');

  const businessView = [
    def.lens,
    flagged.length
      ? `${flagged.length} ${flagged.length === 1 ? 'sits' : 'sit'} in the corner that needs attention; ${def.actionIntro.charAt(0).toLowerCase()}${def.actionIntro.slice(1)}`
      : 'Nothing sits in the corner that needs attention right now.',
    def.caveat ? `Keep in mind: ${def.caveat}` : '',
  ].filter(Boolean).join(' ');

  return {
    headline: flagged.length
      ? `${flagged.length} of ${pts.length} ${flagged.length === 1 ? 'needs' : 'need'} attention: ${def.actionTitle.toLowerCase()}.`
      : `No ${one} stands out on ${def.label.toLowerCase()}.`,
    explanation, whatHappened: '', context: '',
    businessView, meaning: businessView,
    nextSteps: flagged.length ? [def.actionIntro] : ['Re-run this next month to see whether it holds.'],
    source: 'template',
  };
};

export const writeComparisonNarrative = async (input) => {
  const fallback = fallbackComparisonNarrative(input);
  if (!provider.isEnabled() || !(input.comparison.points ?? []).length) return fallback;
  const { def, comparison, flagged } = input;
  // When the dots are people, the model gets aliases and the names are
  // put back into its words here (features/privacy/redact.js).
  const pts = comparison.points.slice(0, MAX_POINTS);
  const alias = def.people ? pseudonymise(pts.map((p) => p.label), def.people) : null;
  const name = (l) => (alias ? alias.alias(l) : l);
  const back = (t) => (alias ? restore(t, alias.map) : t);
  const payload = {
    chart: {
      type: 'scatter — one dot per item, two measures',
      name: def.label,
      what_it_shows: def.about,
      x_axis: def.x, y_axis: def.y,
      period: comparison.dateRange,
      averages_drawn_as_dashed_lines: comparison.averages,
      caveat: def.caveat,
      dots: pts.map((p) => ({ label: name(p.label), x: p.x, y: p.y, note: (alias ? null : p.detail) || null })),
      dots_truncated: comparison.points.length > MAX_POINTS,
    },
    attention_corner: { rule: def.attention, title: def.actionTitle, count: flagged.length, action: def.actionIntro },
    lens: def.lens,
  };
  try {
    const call = await provider.callWithTools({
      systemPrompt: `${SYSTEM_PROMPT}\n\nTHIS IS A SCATTER CHART. In the explanation, say what one dot is, what each axis means, what the dashed average lines are and what the four corners mean. The Actions list printed below is the attention_corner: say "listed below", never name more of it than the data gives.`,
      userMessage: JSON.stringify(payload),
      tools: [narrativeTool],
    });
    if (call.name !== 'write_report') return fallback;
    const a = call.args ?? {};
    const steps = Array.isArray(a.next_steps) ? a.next_steps.map((v) => back(clean(v, 240))).filter(Boolean).slice(0, 3) : [];
    const businessView = back(clean(a.business_view, 1400)) || fallback.businessView;
    return {
      headline: back(clean(a.headline, 200)) || fallback.headline,
      explanation: back(clean(a.explanation, 1400)) || fallback.explanation,
      whatHappened: back(clean(a.what_happened, 900)),
      context: '',
      businessView, meaning: businessView,
      nextSteps: steps.length ? steps : fallback.nextSteps,
      source: 'ai',
    };
  } catch (err) {
    console.warn('[comparison.narrative] falling back:', err.message);
    return { ...fallback, fallbackReason: err.message };
  }
};

export default {
  writeNarrative, fallbackNarrative, buildPayload, narrativeTool, explainChart, businessRead,
  writeComparisonNarrative, fallbackComparisonNarrative,
};
