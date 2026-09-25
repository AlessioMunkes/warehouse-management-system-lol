// ─────────────────────────────────────────────────────────────
// server/src/features/reporting/ai/toolSchema.js
//
// Builds the model's function declarations and system prompt FROM
// reportCatalog.js at module load.
//
// This is the grounding layer. The model gets the list of reports
// that exist, each described in the business English a manager would
// use, and an enum of legal values for every parameter. It cannot
// name a metric that does not exist because the metric name IS an
// enum, and if it somehow did, validateSpec rejects it before pg is
// touched.
//
// Nothing here is hand-maintained. Add a metric to the catalog and
// the model can answer questions about it on the next restart.
// ─────────────────────────────────────────────────────────────
import {
  METRICS, DIMENSIONS, COHORTS, BENEFICIARY_KINDS,
  MOVEMENT_TYPES, DONATION_CATEGORIES, MAX_RANK_LIMIT,
} from '../reportCatalog.js';
import { COMPARISONS, COMPARISON_IDS } from '../reportComparisons.js';

const STRING = 'STRING', INTEGER = 'INTEGER', ARRAY = 'ARRAY', OBJECT = 'OBJECT';

// The ask box is only ever rendered on the Operations Analytics page —
// there is no AI box on the Impact Calculator. Grounding the model in
// operational metrics only means a manager typing an impact-shaped
// question ("how many children did we reach?") into the operations ask
// box gets told that lives on a different screen, rather than the
// model quietly answering it here and blurring the split those two
// screens exist to keep. See buildSystemPrompt's IMPACT REPORTS
// section for how the model is told what exists without being able to
// run it.
const OPERATIONAL_METRICS   = Object.values(METRICS).filter((m) => !m.impactOnly);
const OPERATIONAL_METRIC_IDS = OPERATIONAL_METRICS.map((m) => m.id);
const IMPACT_METRICS = Object.values(METRICS).filter((m) => m.impactOnly);

// Union of every dimension any OPERATIONAL metric declares.
// Per-metric legality is enforced by validateSpec — encoding it here
// would need one function per metric and a far larger prompt.
const ALL_DIMENSIONS = [...new Set(OPERATIONAL_METRICS.flatMap((m) => m.dimensions))];

// How the Operations page can DRAW a report. A display hint only:
// it never changes the query, and the page falls back to the
// default view when the data cannot take the shape asked for (a
// donut of a trend, say).
export const CHART_VIEWS = ['bar', 'hbar', 'line', 'area', 'donut', 'pareto', 'stacked', 'heatmap', 'table'];

export const buildTools = () => ([
  {
    name: 'run_report',
    description:
      'Run one report and show it to the user as a chart. Use this when the question ' +
      'maps to one of the available reports and you can work out the date range.',
    parameters: {
      type: OBJECT,
      properties: {
        metric:    { type: STRING, enum: OPERATIONAL_METRIC_IDS, description: 'Which report to run.' },
        dimension: {
          type: STRING, enum: ALL_DIMENSIONS,
          description:
            'How to break the figure down. Use "none" for a single total. Only some ' +
            'breakdowns are valid per report; an invalid one is rejected with the ' +
            'valid list, and you can try again.',
        },
        date_from: { type: STRING, description: 'Start date, YYYY-MM-DD. Omit for live reports.' },
        date_to:   { type: STRING, description: 'End date, YYYY-MM-DD. Omit for live reports.' },
        cohort:            { type: STRING, enum: COHORTS,            description: 'Optional. One fortnightly cohort.' },
        beneficiary_kind:  { type: STRING, enum: BENEFICIARY_KINDS,  description: 'Optional. One kind of beneficiary.' },
        movement_type:     { type: STRING, enum: MOVEMENT_TYPES,     description: 'Optional. One kind of stock movement.' },
        donation_category: { type: STRING, enum: DONATION_CATEGORIES,description: 'Optional. One donation category.' },
        limit: { type: INTEGER, description: `Optional. Rows for ranked reports. Max ${MAX_RANK_LIMIT}.` },
        chart_type: {
          type: STRING, enum: CHART_VIEWS,
          description:
            'Optional. Only when the user asks for a kind of chart: donut or pie for shares, ' +
            'pareto for "which few cause most", stacked or heatmap for a two-way month breakdown, ' +
            'area or line for trends, table for the raw figures.',
        },
      },
      required: ['metric'],
    },
  },
  {
    name: 'run_comparison',
    description:
      'Show a scatter plot comparing two measures, one dot per item. Use this when the user ' +
      'asks for a scatter plot, or to compare two things against each other per centre, ' +
      'supplier, product or packer, and one of the comparisons matches.',
    parameters: {
      type: OBJECT,
      properties: {
        comparison: { type: STRING, enum: COMPARISON_IDS, description: 'Which comparison to show.' },
        date_from: { type: STRING, description: 'Start date, YYYY-MM-DD.' },
        date_to:   { type: STRING, description: 'End date, YYYY-MM-DD.' },
      },
      required: ['comparison'],
    },
  },
  {
    name: 'ask_clarification',
    description:
      'Ask the user one short question when the request is genuinely ambiguous and ' +
      'guessing would give them the wrong number. Prefer a sensible default over ' +
      'asking. Never ask more than one question.',
    parameters: {
      type: OBJECT,
      properties: {
        question: { type: STRING, description: 'One short question in plain English.' },
        options: {
          type: ARRAY, items: { type: STRING },
          description: 'Two to four short answers the user can tap. Not sentences.',
        },
      },
      required: ['question', 'options'],
    },
  },
  {
    name: 'no_matching_report',
    description:
      'Use this when no available report answers the question: it asks for something the ' +
      'warehouse does not record, for an impact figure, or for donor, caller or volunteer ' +
      'details. Do not force the question onto a report that answers something else.',
    parameters: {
      type: OBJECT,
      properties: {
        reason: {
          type: STRING,
          description:
            'One or two short, friendly sentences for the manager: what you cannot show and, ' +
            'if one exists, the closest report that is available.',
        },
        closest_metric: {
          type: STRING, enum: OPERATIONAL_METRIC_IDS,
          description: 'Optional. The nearest available report, if one is genuinely close.',
        },
      },
      required: ['reason'],
    },
  },
]);

// The catalog descriptions carry the domain rules the schema cannot
// express — that children are counted once per period, that late
// collections still count, that a fortnightly cycle makes "this
// month" two cycles rather than one.
export const buildSystemPrompt = (todayISO) => {
  const live  = [];
  const timed = [];

  for (const m of OPERATIONAL_METRICS) {
    const dims = m.dimensions.map((d) => `${d} (${DIMENSIONS[d].label})`).join(', ');
    const entry = `- ${m.id}\n  What it is: ${m.description}\n  Measured in: ${m.unit}\n  Valid breakdowns: ${dims}`;
    (m.temporal === 'snapshot' ? live : timed).push(entry);
  }

  const impactList = IMPACT_METRICS.map((m) => `${m.id} (${m.label})`).join(', ');
  const comparisons = Object.values(COMPARISONS)
    .map((c) => `- ${c.id}\n  What it is: ${c.description}\n  x: ${c.x.label}, y: ${c.y.label}`)
    .join('\n\n');

  return `You help a warehouse manager at Ladles of Love, a Cape Town food charity, look at their own OPERATIONAL data — what moved, what it cost, what broke. You translate a question into ONE report request. You never write SQL and you never invent figures.

Today's date is ${todayISO} (South African time).

REPORTS OVER A PERIOD — these need date_from and date_to
${timed.join('\n\n')}

LIVE REPORTS — the current position. Do NOT send dates for these
${live.join('\n\n')}

COMPARISONS — scatter plots, one dot per item. Use run_comparison
${comparisons}

A scatter plot is only available for the comparisons above. If the user asks for a scatter of two things that are not listed, use no_matching_report and name the closest comparison.

CHART TYPES
If the user names a kind of chart (pie, donut, stacked, heatmap, pareto, area, table), pass it as chart_type on run_report. Choose a breakdown that suits it: donut and pareto need a category breakdown, stacked and heatmap need a two-way month breakdown such as month_supplier.

IMPACT REPORTS ARE OUT OF SCOPE HERE — DO NOT RUN THEM
${impactList} are beneficiary-impact figures, not operational ones. None of
them is in run_report's metric enum, so calling run_report with one of these
names will fail. If asked about any of them (how many children/adults were
reached, meals enabled, paper saved, compost processed), do NOT attempt a
report — call no_matching_report and tell the user in plain language that
this lives on the separate Impact Calculator (Impact Report) page.

HOW THIS ORGANISATION WORKS
- Beneficiary centres collect food on a fortnightly rotation, in two cohorts: week1 and week2. A calendar month contains roughly two full cycles.
- A collection after 16:00 is late but still counts as collected.
- Goods come IN from suppliers (receiving) and go OUT to beneficiaries (dispatch). "Deliveries" from a supplier means receiving; "deliveries" to a centre means dispatch. If a question is ambiguous between the two, ask.

PRIVACY — NOT NEGOTIABLE
Donation and volunteer reports are aggregate only. There is no report that breaks figures down by donor name, by caller, or by individual volunteer, and no combination of parameters produces one. If asked for that, call no_matching_report, say it is not available and name the aggregate report instead.

RESOLVING DATES
- "This month" means the 1st of the current month to today.
- "Last month" means the whole of the previous calendar month.
- With no period mentioned, use the last three months.
- For period reports, always supply both date_from and date_to.
- For live reports, omit both even if the user mentions a period.

CHOOSING A BREAKDOWN
- A trend or change over time takes month or week.
- A question naming or ranking centres, suppliers or products takes that dimension.
- A single overall figure takes none.
- If your breakdown is invalid for that report you will be told which are valid, and can call run_report again.

Prefer answering with a sensible default over asking. Only use ask_clarification when guessing would genuinely mislead.
If nothing above answers the question, use no_matching_report rather than running a report that answers a different question.`;
};

export default { buildTools, buildSystemPrompt };
