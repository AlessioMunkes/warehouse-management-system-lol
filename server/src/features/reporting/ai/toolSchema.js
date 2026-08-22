// ─────────────────────────────────────────────────────────────
// server/src/features/reporting/ai/toolSchema.js
//
// Builds the model's function declarations and system prompt FROM
// reportCatalog.js at module load.
//
// This is the grounding layer. The model is handed the list of
// reports that exist, each described in the business English a
// manager would use, and an enum of legal values for every
// parameter. It cannot request a metric that does not exist because
// the metric name is an enum, and if it somehow did, validateSpec()
// rejects it before pg is touched.
//
// Nothing here is hand-maintained. Add a metric to the catalog and
// the model can answer questions about it on the next restart.
// ─────────────────────────────────────────────────────────────
import {
  METRICS, METRIC_IDS, DIMENSIONS, COHORTS, BENEFICIARY_KINDS,
  MAX_RANK_LIMIT,
} from '../reportCatalog.js';

// Gemini uses an OpenAPI subset with uppercase type names.
const STRING  = 'STRING';
const INTEGER = 'INTEGER';
const ARRAY   = 'ARRAY';
const OBJECT  = 'OBJECT';

// Union of every dimension any metric declares. Per-metric legality
// is enforced by validateSpec, not here — encoding it in the schema
// would need one function per metric and a much larger prompt.
const ALL_DIMENSIONS = [...new Set(Object.values(METRICS).flatMap((m) => m.dimensions))];

export const buildTools = () => ([
  {
    name: 'run_report',
    description:
      'Run one report and show it to the user as a chart. Use this when the ' +
      'question clearly maps to one of the available reports and you can work ' +
      'out the date range.',
    parameters: {
      type: OBJECT,
      properties: {
        metric: {
          type: STRING,
          enum: METRIC_IDS,
          description: 'Which report to run.',
        },
        dimension: {
          type: STRING,
          enum: ALL_DIMENSIONS,
          description:
            'How to break the figure down. Use "none" for a single total. ' +
            'Only some breakdowns are valid for each report; if you pick an ' +
            'invalid one you will be told and can try again.',
        },
        date_from: { type: STRING, description: 'Start date, YYYY-MM-DD.' },
        date_to:   { type: STRING, description: 'End date, YYYY-MM-DD.' },
        cohort: {
          type: STRING,
          enum: COHORTS,
          description: 'Optional. Restrict to one fortnightly cohort.',
        },
        beneficiary_kind: {
          type: STRING,
          enum: BENEFICIARY_KINDS,
          description: 'Optional. Restrict to one kind of beneficiary.',
        },
        limit: {
          type: INTEGER,
          description: `Optional. For ranked reports, how many rows. Max ${MAX_RANK_LIMIT}.`,
        },
      },
      required: ['metric', 'date_from', 'date_to'],
    },
  },
  {
    name: 'ask_clarification',
    description:
      'Ask the user one short question when the request is genuinely ambiguous ' +
      'and guessing would give them the wrong number. Prefer running a report ' +
      'with a sensible default over asking. Never ask more than one question.',
    parameters: {
      type: OBJECT,
      properties: {
        question: {
          type: STRING,
          description: 'One short question in plain English.',
        },
        options: {
          type: ARRAY,
          items: { type: STRING },
          description: 'Two to four short answers the user can tap. Not sentences.',
        },
      },
      required: ['question', 'options'],
    },
  },
]);

// ── System prompt ─────────────────────────────────────────────
// The catalog descriptions carry the domain rules the schema cannot
// express: that children are counted once per period, that late
// collections still count as collected, that the fortnightly cycle
// makes "this month" two cycles rather than one.
export const buildSystemPrompt = (todayISO) => {
  const reports = Object.values(METRICS).map((m) => {
    const dims = m.dimensions.map((d) => `${d} (${DIMENSIONS[d].label})`).join(', ');
    return `- ${m.id}\n  What it is: ${m.description}\n  Measured in: ${m.unit}\n  Valid breakdowns: ${dims}`;
  }).join('\n\n');

  return `You help a warehouse manager at Ladles of Love, a Cape Town food charity, look at their own data. You translate a question into ONE report request. You never write SQL and you never invent figures.

Today's date is ${todayISO} (South African time).

AVAILABLE REPORTS
${reports}

HOW THIS ORGANISATION WORKS
- Beneficiary centres collect food on a fortnightly rotation, in two cohorts: week1 and week2. A calendar month therefore contains roughly two full cycles.
- "Children reached" counts each centre once per period. "Meals enabled" counts every collection. If someone asks how many children were fed, use children_reached.
- A collection after 16:00 is late but still counts as collected.
- Impact reports cover ECD centres and soup kitchens only.

RESOLVING DATES
- "This month" means the 1st of the current month to today.
- "Last month" means the whole of the previous calendar month.
- With no period mentioned, use the last three months.
- Always supply both date_from and date_to.

CHOOSING A BREAKDOWN
- A question about a trend or about change over time takes month or week.
- A question naming or ranking centres takes ecd_centre.
- A question about a single overall figure takes none.
- If the breakdown you choose is not valid for that report, you will be told which are, and you can call run_report again.

Prefer answering with a sensible default over asking a question. Only use ask_clarification when guessing would genuinely mislead.`;
};

export default { buildTools, buildSystemPrompt };
