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
// ─────────────────────────────────────────────────────────────
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const MUTED = '#676767';

const SUGGESTIONS = [
  'How many children did we reach last month?',
  'Which centres keep missing collections?',
  'Show dispatched food by month',
  'Is decanting wastage getting worse?',
];

export default function AskBox({ onReport, disabled }) {
  const [question, setQuestion] = useState('');
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState(null);
  const [clarify, setClarify]   = useState(null);

  const submit = async (text) => {
    const q = (text ?? question).trim();
    if (!q || busy) return;

    setBusy(true);
    setError(null);
    setClarify(null);
    setQuestion(q);

    try {
      const { askQuestion } = await import('../../../services/reportingAPI');
      const res = await askQuestion(q);
      const data = res.data ?? res;

      if (data.type === 'clarify') setClarify(data);
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
    <div className="rounded-[4px] border-2 border-[#e9e3dd] bg-white p-4 sm:p-5">
      <label htmlFor="ask" className="block text-sm font-medium mb-2">
        Ask about your data
      </label>

      <div className="flex gap-2">
        <Input
          id="ask"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="e.g. how many children did we reach last month?"
          disabled={disabled || busy}
          maxLength={300}
        />
        <Button
          type="button"
          onClick={() => submit()}
          disabled={disabled || busy || !question.trim()}
          className="bg-[#2b3336] hover:bg-black text-white font-bold text-xs tracking-wider rounded-[4px] px-5 shrink-0"
        >
          {busy ? '…' : 'ASK'}
        </Button>
      </div>

      {!question && !clarify && !error && (
        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => submit(s)}
              disabled={disabled || busy}
              className="rounded-full border border-[#e9e3dd] px-3 py-1.5 text-xs hover:border-[#2b3336] disabled:opacity-50"
              style={{ color: MUTED }}
            >
              {s}
            </button>
          ))}
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
                className="rounded-full border-2 border-[#2b3336] px-3 py-1.5 text-xs font-medium hover:bg-[#2b3336] hover:text-white"
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
          <span aria-hidden="true" className="mr-2 font-bold text-[#ef3a40]">!</span>
          {error}
        </p>
      )}
    </div>
  );
}
