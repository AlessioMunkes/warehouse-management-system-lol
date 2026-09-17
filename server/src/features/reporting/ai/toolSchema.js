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
  METRICS, METRIC_IDS, DIMENSIONS, COHORTS, BENEFICIARY_KINDS,
  MOVEMENT_TYPES, DONATION_CATEGORIES, MAX_RANK_LIMIT,
} from '../reportCatalog.js';

const STRING = 'STRING', INTEGER = 'INTEGER', ARRAY = 'ARRAY', OBJECT = 'OBJECT';

// Union of every dimension any metric declares. Per-metric legality
// is enforced by validateSpec — encoding it here would need one
// function per metric and a far larger prompt.
const ALL_DIMENSIONS = [...new Set(Object.values(METRICS).flatMap((m) => m.dimensions))];

export const buildTools = () => ([
  {
    name: 'run_report',
    description:
      'Run one report and show it to the user as a chart. Use this when the question ' +
      'maps to one of the available reports and you can work out the date range.',
    parameters: {
      type: OBJECT,
      properties: {
        metric:    { type: STRING, enum: METRIC_IDS, description: 'Which report to run.' },
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
      },
      required: ['metric'],
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
]);

// The catalog descriptions carry the domain rules the schema cannot
// express — that children are counted once per period, that late
// collections still count, that a fortnightly cycle makes "this
// month" two cycles rather than one.
export const buildSystemPrompt = (todayISO) => {
  const live  = [];
  const timed = [];

  for (const m of Object.values(METRICS)) {
    const dims = m.dimensions.map((d) => `${d} (${DIMENSIONS[d].label})`).join(', ');
    const entry = `- ${m.id}\n  What it is: ${m.description}\n  Measured in: ${m.unit}\n  Valid breakdowns: ${dims}`;
    (m.temporal === 'snapshot' ? live : timed).push(entry);
  }

  return `You help a warehouse manager at Ladles of Love, a Cape Town food charity, look at their own data. You translate a question into ONE report request. You never write SQL and you never invent figures.

Today's date is ${todayISO} (South African time).

REPORTS OVER A PERIOD — these need date_from and date_to
${timed.join('\n\n')}

LIVE REPORTS — the current position. Do NOT send dates for these
${live.join('\n\n')}

HOW THIS ORGANISATION WORKS
- Beneficiary centres collect food on a fortnightly rotation, in two cohorts: week1 and week2. A calendar month contains roughly two full cycles.
- "Children reached" counts each centre once per period. "Meals enabled" counts every collection. If someone asks how many children were fed, use children_reached.
- A collection after 16:00 is late but still counts as collected.
- Impact reports cover ECD centres and soup kitchens only.
- Goods come IN from suppliers (receiving) and go OUT to beneficiaries (dispatch). "Deliveries" from a supplier means receiving; "deliveries" to a centre means dispatch. If a question is ambiguous between the two, ask.

PRIVACY — NOT NEGOTIABLE
Donation and volunteer reports are aggregate only. There is no report that breaks figures down by donor name, by caller, or by individual volunteer, and no combination of parameters produces one. If asked for that, say it is not available and offer the aggregate report instead.

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

Prefer answering with a sensible default over asking. Only use ask_clarification when guessing would genuinely mislead.`;
};

export default { buildTools, buildSystemPrompt };
