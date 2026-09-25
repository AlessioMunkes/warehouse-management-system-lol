// ─────────────────────────────────────────────────────────────
// client/src/features/reporting/components/AskBox.jsx
//
// Type a question, get a chart.
//
// SUGGESTED PROMPTS ARE NOT DECORATION
// A blank text box is intimidating, and a manager has no way to
// guess what vocabulary the system understands. The chips teach the
// shape of a good question in one glance, which is also what makes
// this usable for a less confident user under ACC-09.
//
// CLARIFICATION IS TAPPABLE, NOT A CONVERSATION
// When the question is ambiguous the server returns options rather
// than a follow-up sentence. One tap resolves it — no typing, no
// multi-turn thread to lose your place in (ACC-05).
//
// NO MATCH IS A NOTE, NOT AN ERROR
// A question the catalog cannot answer comes back as
// { type: 'no_match' } and renders as a neutral note with the
// closest report and the suggested questions. Red is kept for real
// failures (the assistant is down, the quota is used up).
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Info } from 'lucide-react';
import { FEATURED_QUESTIONS } from '../operationalQuestions';

const MUTED = 'var(--ink-soft)';

// Operational questions only — this box is scoped to Operations
// Analytics (see toolSchema.js's OPERATIONAL_METRICS), so a suggestion
// here should never be one the model has been told to redirect
// elsewhere. Impact questions belong on the Impact Report page.
const SUGGESTIONS = FEATURED_QUESTIONS;

export default function AskBox({ onReport, onPickMetric, disabled }) {
  const [question, setQuestion] = useState('');
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState(null);
  const [clarify, setClarify]   = useState(null);
  const [noMatch, setNoMatch]   = useState(null);

  const submit = async (text) => {
    const q = (text ?? question).trim();
    if (!q || busy) return;

    setBusy(true);
    setError(null);
    setClarify(null);
    setNoMatch(null);
    setQuestion(q);

    try {
      const { askQuestion } = await import('../../../services/reportingAPI');
      const res = await askQuestion(q);
      const data = res.data ?? res;

      if (data.type === 'clarify') setClarify(data);
      else if (data.type === 'no_match') setNoMatch(data);
      else onReport(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // A clarification answer is appended to the original question
  // rather than sent alone, because the server holds no conversation
  // state — one call, one spec, nothing to keep in sync.
  const answerClarification = (option) => submit(`${question} (${option})`);

  return (
    <div className="rounded-[4px] border-2 border-line bg-surface p-4 sm:p-5">
      <label htmlFor="ask" className="block text-sm font-medium mb-2">
        Ask about your data
      </label>

      <div className="flex gap-2">
        <Input
          id="ask"
          value={question}
          onChange={(e) => { setQuestion(e.target.value); setNoMatch(null); }}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="e.g. which suppliers short-delivered last month?"
          disabled={disabled || busy}
          maxLength={300}
        />
        <Button
          type="button"
          onClick={() => submit()}
          disabled={disabled || busy || !question.trim()}
          className="bg-ink hover:bg-ink/90 text-on-ink font-bold text-xs tracking-wider rounded-[4px] px-5 shrink-0"
        >
          {busy ? '…' : 'ASK'}
        </Button>
      </div>

      {(!question || noMatch) && !clarify && !error && (
        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => submit(s)}
              disabled={disabled || busy}
              className="rounded-full border border-line px-3 py-1.5 text-xs hover:border-ink disabled:opacity-50"
              style={{ color: MUTED }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {noMatch && (
        <div
          role="status"
          className="mt-4 flex gap-3 rounded-[4px] border-2 border-line p-3 text-sm"
        >
          <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" style={{ color: MUTED }} />
          <div>
            <p>{noMatch.message}</p>
            {noMatch.closest && onPickMetric && (
              <button
                type="button"
                onClick={() => { setNoMatch(null); onPickMetric(noMatch.closest.id); }}
                className="mt-2 rounded-full border-2 border-ink px-3 py-1.5 text-xs font-medium hover:bg-ink hover:text-on-ink"
              >
                Open {noMatch.closest.label}
              </button>
            )}
            <p className="mt-2 text-xs" style={{ color: MUTED }}>
              Try one of the suggested questions, or pick a report from Browse all reports.
            </p>
          </div>
        </div>
      )}

      {clarify && (
        <div className="mt-4">
          <p className="text-sm font-medium">{clarify.question}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {clarify.options.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => answerClarification(o)}
                disabled={busy}
                className="rounded-full border-2 border-ink px-3 py-1.5 text-xs font-medium hover:bg-ink hover:text-on-ink"
              >
                {o}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm">
          {/* Icon plus text, never colour alone — ACC-03. */}
          <span aria-hidden="true" className="mr-2 font-bold text-brand">!</span>
          {error}
        </p>
      )}
    </div>
  );
}
